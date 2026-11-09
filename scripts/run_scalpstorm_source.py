#!/usr/bin/env python3
"""Owner-local read-only collector for the approved 09:40 paper strategy."""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import json
import math
import os
import re
import signal
import threading
import time
from pathlib import Path

from atlas.integrations.credentials import read_analytics_credential
from atlas.integrations.nse_observer import (
    acquire_lock,
    failure_state,
    private_directory,
    save_snapshot,
)
from atlas.integrations.nse_snapshot import exchange_status
from atlas.integrations.nse_sources import IST
from atlas.integrations.scalpstorm_owner_source import (
    NIFTY,
    broad_snapshot,
    fetch_quotes,
    fetch_universe,
)
from atlas.paper.scalpstorm_owner import millis, rank_volume, session_time


def private_saved(path: Path) -> dict:
    try:
        info = path.lstat()
        if (
            path.is_symlink()
            or not path.is_file()
            or info.st_mode & 0o077
            or info.st_uid != os.getuid()
            or info.st_size > 8_000_000
        ):
            return {}
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except (ValueError, OSError):
        return {}


def recover_signals(
    state_dir: Path, today: str, universe_hash: str
) -> tuple[dict | None, dict | None]:
    saved = private_saved(state_dir / "scalpstorm-owner-input.json")
    if (
        saved.get("schema") != "atlas.scalpstorm-owner-input.v1"
        or saved.get("dataClass") != "BROKER_API_OBSERVATION"
    ):
        return None, None
    ranking, nifty = saved.get("ranking"), saved.get("niftySignal")
    if (
        not isinstance(ranking, dict)
        or ranking.get("universeHash") != universe_hash
        or str(ranking.get("observedAt", ""))[:10] != today
    ):
        ranking = None
    if (
        not isinstance(nifty, dict)
        or str(nifty.get("observedAt", ""))[:10] != today
        or nifty.get("previousCloseMethod")
        not in {"PROVIDER_PREVIOUS_CLOSE", "LAST_PRICE_MINUS_NET_CHANGE"}
    ):
        nifty = None
    else:
        nifty = validated_nifty_signal(nifty, prior_daily_reference(state_dir, today))
    return ranking, nifty


def prior_daily_reference(state_dir: Path, today: str) -> dict | None:
    history = private_saved(state_dir / "scalpstorm-history.json")
    prices = history.get("prices")
    if (
        history.get("schema") != "atlas.scalpstorm-history.v1"
        or history.get("realOrdersEnabled") is not False
        or history.get("actualCapitalINR") != 0
        or not isinstance(prices, dict)
        or prices.get("instrumentKey") != NIFTY
        or prices.get("source") != "Upstox Analytics V3 / days / 1"
        or not isinstance(prices.get("bars"), list)
    ):
        return None
    try:
        target = dt.date.fromisoformat(today)
        candidates = []
        for bar in prices["bars"]:
            date = dt.date.fromisoformat(bar["time"][:10])
            close = bar["close"]
            if (
                date < target
                and not isinstance(close, bool)
                and isinstance(close, (int, float))
                and math.isfinite(close)
                and close > 0
            ):
                candidates.append((date, float(close)))
        if not candidates:
            return None
        date, close = max(candidates, key=lambda item: item[0])
        source_hash = prices.get("sourcePayloadSHA256")
        if (
            (target - date).days > 7
            or prices.get("lastDate") != date.isoformat()
            or not isinstance(source_hash, str)
            or not re.fullmatch(r"[a-f0-9]{64}", source_hash)
        ):
            return None
        return {"date": date.isoformat(), "close": close, "sourcePayloadSHA256": source_hash}
    except (KeyError, TypeError, ValueError):
        return None


def validated_nifty_signal(quote: dict, prior: dict | None) -> dict | None:
    if prior is None:
        return None
    provider_close = quote.get("previousClose")
    if (
        isinstance(provider_close, bool)
        or not isinstance(provider_close, (int, float))
        or not math.isfinite(provider_close)
        or not math.isclose(provider_close, prior["close"], rel_tol=0.00001, abs_tol=0.1)
    ):
        return None
    return {
        **quote,
        "previousClose": prior["close"],
        "providerPreviousClose": provider_close,
        "previousCloseDate": prior["date"],
        "dailySourcePayloadSHA256": prior["sourcePayloadSHA256"],
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--upstox-credential-file", type=Path, required=True)
    p.add_argument("--state-dir", type=Path, required=True)
    p.add_argument("--once", action="store_true")
    args = p.parse_args()
    private_directory(args.state_dir)
    token = read_analytics_credential(args.upstox_credential_file)
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    day = ""
    universe = {}
    ranking = None
    nifty_signal = None
    last_full = float("-inf")
    last_market = float("-inf")
    market = {}
    market_at = ""
    failures = 0
    with acquire_lock(args.state_dir / "nse-market.json"):
        while not stop.is_set():
            try:
                now = dt.datetime.now(IST)
                today = now.date().isoformat()
                minute = now.hour * 60 + now.minute
                if today != day:
                    universe = fetch_universe()
                    day = today
                    ranking, nifty_signal = recover_signals(
                        args.state_dir, today, universe["payloadSHA256"]
                    )
                    last_full = float("-inf")
                    save_snapshot(args.state_dir / "scalpstorm-universe.json", universe)
                    folder = args.state_dir / "scalpstorm-source" / today
                    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
                    save_snapshot(folder / "universe.json", universe)
                if time.monotonic() - last_market >= 30:
                    market = exchange_status(token=token)
                    market_at = dt.datetime.now(dt.UTC).isoformat()
                    last_market = time.monotonic()
                # Broad volume observations are taken before entry, never reconstructed
                # later from full-day volume. A missed window remains a no-trade day.
                if market["marketOpen"] and (
                    (minute == 555 and time.monotonic() - last_full >= 120)
                    or (
                        minute == 579
                        and (
                            ranking is None
                            or millis(ranking["startedAt"]) < session_time(today, 579)
                        )
                    )
                ):
                    candidate = broad_snapshot(universe, token)
                    if (
                        dt.datetime.fromisoformat(candidate["observedAt"]).astimezone(IST).hour * 60
                        + dt.datetime.fromisoformat(candidate["observedAt"]).astimezone(IST).minute
                        < 580
                    ):
                        ranking = candidate
                        archive = (
                            args.state_dir
                            / "scalpstorm-source"
                            / today
                            / (str(round(time.time() * 1000)) + ".json.gz")
                        )
                        with gzip.open(archive, "wt", encoding="utf-8") as stream:
                            json.dump(candidate, stream, separators=(",", ":"))
                        archive.chmod(0o600)
                    last_full = time.monotonic()
                selected = []
                if ranking is not None and minute >= 580:
                    try:
                        selected = rank_volume(ranking, today, round(time.time() * 1000))
                    except (KeyError, TypeError, ValueError):
                        pass
                watch = {NIFTY: "NIFTY 50", "NSE_EQ|INE002A01018": "RELIANCE"}
                if minute >= 580:
                    watch.update({r["instrumentKey"]: r["symbol"] for r in selected})
                account = private_saved(args.state_dir / "scalpstorm-owner.json")
                if (
                    account.get("schema") == "atlas.scalpstorm-owner-report.v1"
                    and account.get("ledgerVerified") is True
                ):
                    for position in account.get("positions", [])[:10]:
                        watch[position["instrumentKey"]] = position["symbol"]
                quotes, raw_hash = fetch_quotes(watch, token)
                received = dt.datetime.now(dt.UTC).isoformat()
                nifty = next((q for q in quotes if q["instrumentKey"] == NIFTY), None)
                source_now = dt.datetime.fromisoformat(received).astimezone(IST)
                if (
                    nifty_signal is None
                    and source_now.hour == 9
                    and source_now.minute == 30
                    and nifty
                ):
                    nifty_signal = validated_nifty_signal(
                        nifty, prior_daily_reference(args.state_dir, today)
                    )
                    if nifty_signal is not None:
                        save_snapshot(
                            args.state_dir / "scalpstorm-source" / today / "nifty-0930.json",
                            nifty_signal,
                        )
                inp = {
                    "schema": "atlas.scalpstorm-owner-input.v1",
                    "source": "Upstox Analytics",
                    "dataClass": "BROKER_API_OBSERVATION",
                    "realOrdersEnabled": False,
                    "observedAt": received,
                    "market": market,
                    "marketObservedAt": market_at,
                    "quotes": quotes,
                    "ranking": ranking,
                    "niftySignal": nifty_signal,
                }
                save_snapshot(args.state_dir / "scalpstorm-owner-input.json", inp)
                display_quotes = [
                    {k: v for k, v in q.items() if k not in {"previousClose", "observedAt"}}
                    for q in quotes
                    if q["instrumentKey"] in {NIFTY, "NSE_EQ|INE002A01018"}
                ]
                save_snapshot(
                    args.state_dir / "nse-market.json",
                    {
                        "schema": 1,
                        "mode": "OWNER_NSE_OBSERVATION",
                        "status": "OK",
                        "source": "Upstox Analytics",
                        "observedAt": received,
                        "market": market,
                        "quotes": display_quotes,
                        "sourcePayloadSHA256": raw_hash,
                        "audience": "OWNER_ONLY",
                        "realOrdersEnabled": False,
                        "paperOrdersEnabled": False,
                        "actualCapitalINR": 0,
                        "executionFreshnessCertified": False,
                    },
                )
                save_snapshot(
                    args.state_dir / "scalpstorm-source-status.json",
                    {
                        "observedAt": received,
                        "status": "OK",
                        "eligibleCount": len(universe["instruments"]),
                        "rankingReceivedCount": ranking["receivedCount"] if ranking else None,
                        "rankingComplete": ranking["complete"] if ranking else None,
                        "niftySignalCaptured": nifty_signal is not None,
                        "market": market,
                        "realOrdersEnabled": False,
                    },
                )
                failures = 0
                delay = 2 if market["marketOpen"] else 60
                if args.once:
                    print("Owner source captured; data only; no broker orders", flush=True)
                    return 0
            except (RuntimeError, ValueError, OSError, KeyError, TypeError) as error:
                failures += 1
                failure, delay, gate = failure_state(error, failures)
                save_snapshot(
                    args.state_dir / "scalpstorm-source-status.json",
                    {**failure, "realOrdersEnabled": False},
                )
                if gate or args.once:
                    print("Owner source paused; authentication or data review required", flush=True)
                    return 1
            stop.wait(delay)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
