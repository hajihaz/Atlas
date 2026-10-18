#!/usr/bin/env python3
"""Publish public-safe ScalpStorm research status and NIFTY opening signals.

Computes ONLY index direction signals from locally provided public research data.
Does NOT rank NSE stocks, issue trades, or label missing P&L as zero.
Validated output is shared by the Atlas dashboard and ChatGPT-readable endpoint.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
from collections import Counter
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

from atlas.paper.scalpstorm import RANK_MINUTES, SESSIONS, Rules

IST = ZoneInfo("Asia/Kolkata")
SOURCE_URL = "https://github.com/technovusin/nifty50-historical-data"
EXPECTED_FIELDS = ["Epoch", "Timestamp", "Open", "High", "Low", "Close", "Volume"]


def load_index_sources(paths: list[Path]) -> tuple[dict[dt.date, dict[dt.time, dict]], list[dict]]:
    if len(paths) != 2 or not all(p.exists() for p in paths):
        raise ValueError("two public NIFTY source month files (2026-09 and 2026-10) required")
    raw_days: dict[dt.date, dict[dt.time, dict]] = {}
    sources: list[dict] = []
    for path in paths:
        if not path.is_file() or path.stat().st_size > 15_000_000:
            raise ValueError("invalid/unbounded source file")
        binary = path.read_bytes()
        sha = hashlib.sha256(binary).hexdigest()
        sources.append({"name": path.name, "sha256": sha, "bytes": len(binary)})
        reader = csv.DictReader(binary.decode("utf-8-sig").splitlines())
        if reader.fieldnames != EXPECTED_FIELDS:
            raise ValueError("NIFTY source CSV schema mismatch")
        for row in reader:
            stamp = dt.datetime.fromisoformat(row["Timestamp"])
            if stamp.tzinfo is not None:
                raise ValueError("source timestamps must be plain IST strings")
            day = stamp.date()
            if day not in SESSIONS:
                if SESSIONS[0] <= day <= SESSIONS[-1]:
                    raise ValueError("unexpected holiday/weekend intraday data in target window")
                continue
            if (
                stamp.second
                or stamp.microsecond
                or not dt.time(9, 15) <= stamp.time() <= dt.time(15, 29)
            ):
                raise ValueError(f"{day}: bad minute boundary")
            expected_epoch = int(stamp.replace(tzinfo=IST).timestamp())
            if expected_epoch != int(row["Epoch"]):
                raise ValueError(f"{day}: timestamp/epoch mismatch")
            op, hi, lo, cl = [Decimal(row[k]) for k in ("Open", "High", "Low", "Close")]
            if any(not p.is_finite() or p <= 0 for p in (op, hi, lo, cl)):
                raise ValueError(f"{day}: bad price")
            if lo > min(op, cl) or hi < max(op, cl) or lo > hi:
                raise ValueError(f"{day}: inconsistent OHLC")
            if int(row["Volume"]) < 0:
                raise ValueError(f"{day}: negative volume")
            times = raw_days.setdefault(day, {})
            if stamp.time() in times:
                raise ValueError(f"{day}: duplicate index bar")
            times[stamp.time()] = {"open": op, "close": cl}
    if set(raw_days) != set(SESSIONS):
        raise ValueError(f"incomplete NIFTY 20-session coverage: {len(raw_days)}/20")
    full_minutes = {
        (dt.datetime.combine(SESSIONS[0], dt.time(9, 15)) + dt.timedelta(minutes=i)).time()
        for i in range(375)
    }
    for day, times in raw_days.items():
        if set(times) != full_minutes or not set(RANK_MINUTES).issubset(times):
            raise ValueError(f"{day}: missing NIFTY one-minute bars")
    return raw_days, sources


def build_campaign(
    raw_days: dict[dt.date, dict[dt.time, dict]], sources: list[dict], source_commit: str
) -> dict:
    if len(source_commit) != 40 or any(c not in "0123456789abcdef" for c in source_commit):
        raise ValueError("exact SHA1 Git source commit required")
    rule = Rules()
    counts: Counter[str] = Counter()
    days = []
    for day in SESSIONS:
        opening = raw_days[day][dt.time(9, 15)]["open"]
        at_929 = raw_days[day][dt.time(9, 29)]["close"]
        change = (at_929 / opening - Decimal("1")) * Decimal("100")
        direction = (
            "BUY"
            if change > rule.direction_threshold * 100
            else "SELL"
            if change < -rule.direction_threshold * 100
            else "NO_TRADE"
        )
        counts[direction] += 1
        days.append(
            {
                "date": day.isoformat(),
                "status": "INDEX_SIGNAL_RECONSTRUCTED_STOCK_DATA_MISSING",
                "indexSignal": direction,
                "niftyOpen": str(opening),
                "nifty929Close": str(at_929),
                "niftyOpeningChangePct": str(change.quantize(Decimal("0.0001"))),
                "niftyMinutesChecked": 375,
                "selected": None,
                "trades": None,
                "netPnl": None,
            }
        )
    return {
        "schemaVersion": 2,
        "strategy": "ScalpStorm X",
        "mode": "PAPER / RESEARCH ONLY",
        "capitalINR": 100000,
        "windowStart": SESSIONS[0].isoformat(),
        "windowEnd": SESSIONS[-1].isoformat(),
        "expectedSessions": 20,
        "calendarSessionsVerified": 20,
        "indexSignalSessionsValidated": 20,
        "verifiedSessions": 0,
        "sourceStatus": "COMMUNITY_NIFTY_OHLC_VALIDATED_NOT_EXCHANGE_ATTESTED",
        "selectionStatus": "FULL_STOCK_UNIVERSE_ONE_MINUTE_DATA_MISSING",
        "indexSource": {
            "repository": SOURCE_URL,
            "commit": source_commit,
            "files": sources,
            "verifiedMethod": (
                "375 complete IST candles/session, consistent epochs, OHLC sanity, no missing bars"
            ),
            "attestation": "Community archive only; not independently corroborated with NSE/broker",
        },
        "signalRule": "NIFTY 09:15 open vs 09:29 close; +/-0.15%, research assumption",
        "signalCounts": {
            "BUY": counts["BUY"],
            "SELL": counts["SELL"],
            "NO_TRADE": counts["NO_TRADE"],
        },
        "netPnlINR": None,
        "liveCapitalBlocked": True,
        "days": days,
    }


def chat_digest(campaign: dict) -> str:
    lines = [
        "ATLAS / SCALPSTORM X — 20-SESSION RESEARCH REPORT",
        "Period: 18 Sep-16 Oct 2026 | Virtual capital ₹1,00,000",
        (
            "DATA VERDICT: 20 NSE calendar sessions verified; "
            "20/20 community NIFTY index signals reconstructed;"
        ),
        "0/20 complete top-volume-stock selection and backtest sessions verified.",
        "ACTUAL INTRADAY P&L: UNAVAILABLE — not zero and not estimated.",
        "Real-money order execution: BLOCKED.",
        "Source: " + campaign["indexSource"]["repository"],
        "Exact source commit: " + campaign["indexSource"]["commit"],
        "Signals use provisional +/-0.15% 9:15-to-9:29 NIFTY rule; not stock-trade returns.",
        "Date       NIFTY 09:15→09:29      Signal    Stock trade P&L",
    ]
    for d in campaign["days"]:
        lines.append(
            f"{d['date']}  {Decimal(d['niftyOpeningChangePct']):+8.4f}%  "
            f"{d['indexSignal']:8}  NOT VERIFIED"
        )
    x = campaign["signalCounts"]
    lines.append(f"Counts: BUY {x['BUY']} | SELL {x['SELL']} | NO_TRADE {x['NO_TRADE']}.")
    lines.append("Do not treat these directional signals as profitable positions.")
    return "\n".join(lines) + "\n"


def main() -> int:
    cli = argparse.ArgumentParser()
    cli.add_argument("--september", type=Path, required=True)
    cli.add_argument("--october", type=Path, required=True)
    cli.add_argument("--source-commit", required=True)
    cli.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parents[1])
    args = cli.parse_args()
    raw, sources = load_index_sources([args.september, args.october])
    campaign = build_campaign(raw, sources, args.source_commit)
    root = args.project_root.resolve()
    target = root / "frontend/src/data/scalpstorm-campaign.json"
    public = root / "frontend/public/scalpstorm-report.json"
    digest = root / "frontend/public/scalpstorm-chat-report.txt"
    for p in (target, public, digest):
        p.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(campaign, indent=2, ensure_ascii=False) + "\n"
    target.write_text(content, encoding="utf-8")
    public.write_text(content, encoding="utf-8")
    digest.write_text(chat_digest(campaign), encoding="utf-8")
    print(
        json.dumps(
            {
                "count": len(campaign["days"]),
                "signals": campaign["signalCounts"],
                "top_ten_verified": campaign["verifiedSessions"],
                "net_pnl": None,
                "source_commit": args.source_commit,
                "report": str(public),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
