#!/usr/bin/env python3
"""Replay actual candles with an explicit current-universe research limitation."""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import json
from pathlib import Path
from urllib.parse import quote

from atlas.integrations.credentials import read_analytics_credential
from atlas.integrations.nse_observer import private_directory, save_snapshot
from atlas.integrations.nse_sources import IST, _parse_bars
from atlas.market.read_only_transport import market_data_get
from atlas.paper.scalpstorm_owner import OwnerStore, digest, iso, session_time
from atlas.paper.scalpstorm_reporting import with_period_totals

NIFTY = "NSE_INDEX|Nifty 50"


def read_source(file: Path, key: str, universe_hash: str) -> list:
    if file.is_symlink() or file.stat().st_mode & 0o077 or file.stat().st_size > 8_000_000:
        raise ValueError("private source archive required")
    with gzip.open(file, "rt") as stream:
        raw = stream.read(8_000_001)
    if len(raw) > 8_000_000:
        raise ValueError("oversized source archive")
    value = json.loads(raw)
    if value.get("instrumentKey") != key or value.get("universeHash") != universe_hash:
        raise ValueError("historical identity mismatch")
    if digest(value["response"]) != value["sourcePayloadSHA256"]:
        raise ValueError("historical source checksum mismatch")
    rows = value["response"]["data"]["candles"]
    return _parse_bars(rows, epoch=False) if rows else []


def modeled_quote(row: dict, bars: dict, date: str, minute: int) -> dict | None:
    now = session_time(date, minute)
    current, previous = bars.get(now), bars.get(now - 60_000)
    if not current or not previous:
        return None
    return {
        "instrumentKey": row["instrumentKey"],
        "symbol": row["symbol"],
        "lastPrice": current["open"],
        "priceUnit": "INR",
        "lastTradeAt": iso(now),
        "quoteTimestamp": iso(now),
        "executionModel": "NEXT_MINUTE_OPEN",
        "previousMinuteVolume": previous["volume"],
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--upstox-credential-file", required=True, type=Path)
    p.add_argument("--state-dir", required=True, type=Path)
    p.add_argument("--source-dir", required=True, type=Path)
    args = p.parse_args()
    private_directory(args.state_dir)
    source = args.source_dir
    manifest = json.loads((source / "progress.json").read_text())
    if manifest.get("complete") is not True or manifest.get("failed") != 0:
        raise ValueError("full historical capture is not complete")
    universe = json.loads((source / "universe.json").read_text())
    if len(universe["instruments"]) != manifest["eligibleCount"]:
        raise ValueError("historical universe coverage mismatch")
    token = read_analytics_credential(args.upstox_credential_file)
    response = market_data_get(
        "https://api.upstox.com/v3/historical-candle/"
        + quote(NIFTY, safe="")
        + "/minutes/1/"
        + manifest["toDate"]
        + "/"
        + manifest["fromDate"],
        {"Accept": "application/json", "Authorization": f"Bearer {token}"},
    )
    if not isinstance(response, dict) or response.get("status") != "success":
        raise ValueError("historical Nifty signal source unavailable")
    nifty_bars = _parse_bars(response["data"]["candles"], epoch=False)
    save_snapshot(
        source / "nifty-minute-source.json",
        {"response": response, "sourcePayloadSHA256": digest(response), "instrumentKey": NIFTY},
    )
    history = json.loads((args.state_dir / "scalpstorm-history.json").read_text())
    daily = {row["time"][:10]: row["close"] for row in history["prices"]["bars"]}
    dates = sorted(d for d in daily if manifest["fromDate"] <= d <= manifest["toDate"])
    nmap = {round(b.timestamp.timestamp() * 1000): b for b in nifty_bars}
    instrument_bars = {}
    ranking_days = {date: [] for date in dates}
    for row in universe["instruments"]:
        key = row["instrumentKey"]
        file = source / (hashlib.sha256(key.encode()).hexdigest() + ".json.gz")
        bars = read_source(file, key, universe["payloadSHA256"])
        early = {}
        retained = {}
        for bar in bars:
            t = bar.timestamp.astimezone(IST)
            date, minute = t.date().isoformat(), t.hour * 60 + t.minute
            if date not in ranking_days:
                continue
            if 555 <= minute < 579:
                volume, latest = early.get(date, (0, None))
                early[date] = (
                    volume + bar.volume,
                    bar if latest is None or bar.timestamp > latest.timestamp else latest,
                )
            if minute in (580, 581) or 914 <= minute < 930:
                retained[round(bar.timestamp.timestamp() * 1000)] = {
                    "open": float(bar.open),
                    "volume": bar.volume,
                }
        instrument_bars[key] = retained
        for date in dates:
            volume, latest = early.get(date, (0, None))
            cutoff = session_time(date, 579)
            # No opening candles means unknown, not zero volume. The research
            # replay ranks only the stocks with actual pre-entry observations.
            if latest is not None:
                ranking_days[date].append(
                    {
                        **row,
                        "volume": volume,
                        "lastPrice": float(latest.close),
                        "lastTradeAt": iso(cutoff),
                        "quoteTimestamp": iso(cutoff),
                    }
                )
    journal = source / "scalpstorm-owner-history.sqlite3"
    if journal.exists():
        raise ValueError("replay already exists; review existing journal instead of resetting")
    store = OwnerStore(journal, session_time(dates[0], 555), mode="HISTORICAL_REPLAY")
    try:
        coverage_days = []
        for date in dates:
            previous_dates = [d for d in daily if d < date]
            nifty_bar = nmap.get(session_time(date, 569))
            nifty = None
            if nifty_bar and previous_dates:
                nifty = {
                    "lastPrice": float(nifty_bar.close),
                    "previousClose": daily[max(previous_dates)],
                    "observedAt": iso(session_time(date, 570) + 1000),
                    "quoteTimestamp": iso(session_time(date, 570)),
                }
            cutoff = session_time(date, 579)
            rank_rows = ranking_days[date]
            coverage_days.append(
                {
                    "date": date,
                    "universeCount": len(universe["instruments"]),
                    "observedCount": len(rank_rows),
                    "missingCount": len(universe["instruments"]) - len(rank_rows),
                }
            )
            ranking = {
                "startedAt": iso(cutoff),
                "observedAt": iso(cutoff + 30_000),
                "complete": True,
                "eligibleCount": len(rank_rows),
                "rows": rank_rows,
                "universeHash": universe["payloadSHA256"],
            }
            for minute in [580, 581, *range(915, 930)]:
                now = session_time(date, minute)
                # Only the next open and a PREVIOUS completed minute's volume
                # enter the execution model; no same-bar close or future book.
                state, _ = store.load()
                watch = (
                    universe["instruments"]
                    if minute <= 581
                    else [
                        row
                        for row in universe["instruments"]
                        if row["instrumentKey"] in state["positions"]
                    ]
                )
                quotes = [
                    q
                    for row in watch
                    if (
                        q := modeled_quote(row, instrument_bars[row["instrumentKey"]], date, minute)
                    )
                ]
                inp = {
                    "schema": "atlas.scalpstorm-owner-input.v1",
                    "source": "Upstox Analytics",
                    "dataClass": "HISTORICAL_CANDLE_SIMULATION",
                    "realOrdersEnabled": False,
                    "observedAt": iso(now),
                    "market": {"exchange": "NSE", "status": "NORMAL_OPEN", "marketOpen": True},
                    "marketObservedAt": iso(now),
                    "quotes": quotes,
                    "ranking": ranking,
                    "niftySignal": nifty,
                }
                store.advance(inp, now)
                state, _ = store.load()
                if minute >= 915 and not state["positions"]:
                    break
        result = with_period_totals(store.report(session_time(dates[-1], 929)))
        replay = {
            k: result[k]
            for k in (
                "days",
                "events",
                "monthly",
                "yearly",
                "netPnlINR",
                "status",
                "fills",
                "feesINR",
            )
        }
        replay.update(
            {
                "scope": manifest["fromDate"]
                + " to "
                + manifest["toDate"]
                + " · "
                + str(manifest["eligibleCount"])
                + " stocks from the current universe",
                "qualified": False,
                "historicalPointInTimeUniverse": False,
                "ledgerVerified": result["ledgerVerified"],
                "ledgerHead": result["ledgerHead"],
                "sourceCandles": manifest["candles"],
                "coverageByDay": coverage_days,
                "notes": [
                    (
                        "Rankings cover stocks with pre-entry candles in the current universe; "
                        "missing bars are excluded, not assumed to have zero volume. "
                        "These rankings may omit eligible stocks and are not market-wide."
                    ),
                    (
                        "Missing individual minutes can understate recorded volume; an absence may "
                        "mean a data gap, no trade or a later listing."
                    ),
                    (
                        "Current-universe research has survivorship and membership bias; it is "
                        "not a certified historical strategy result."
                    ),
                    (
                        "Ranking uses cumulative source share volume through 09:38; the 09:39 "
                        "minute is excluded to avoid future volume."
                    ),
                    (
                        "The 09:40 decision fills at the next 09:41 minute open. Exit attempts "
                        "begin at the 15:15 open."
                    ),
                    (
                        "No historical order book is available. Modeled fills are capped at 1% "
                        "of the previous completed minute volume, with 0.10% costs and 0.05% "
                        "slippage per side."
                    ),
                    (
                        "Missing bars are missing observations; unfilled positions remain "
                        "visible. These modeled returns do not qualify any strategy."
                    ),
                ],
            }
        )
        history["replay"] = replay
        history["observedAt"] = dt.datetime.now(dt.UTC).isoformat()
        save_snapshot(args.state_dir / "scalpstorm-history.json", history)
        save_snapshot(source / "replay-report.json", result)
        print(
            json.dumps(
                {
                    "sessions": len(result["days"]),
                    "fills": result["fills"],
                    "netPnlINR": result["netPnlINR"],
                    "qualified": False,
                    "ledgerVerified": True,
                }
            )
        )
    finally:
        store.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
