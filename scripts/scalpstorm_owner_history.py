#!/usr/bin/env python3
"""Capture real daily benchmark history; never invent unsupported strategy returns."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
from urllib.parse import quote

from atlas.integrations.credentials import read_analytics_credential
from atlas.integrations.nse_observer import private_directory, save_snapshot
from atlas.integrations.nse_sources import IST, _parse_bars
from atlas.market.read_only_transport import market_data_get


def build_history(token: str, today: dt.date | None = None) -> dict:
    today = today or dt.datetime.now(IST).date()
    end = today - dt.timedelta(days=1)
    try:
        start = end.replace(year=end.year - 10) + dt.timedelta(days=1)
    except ValueError:
        start = end.replace(year=end.year - 10, day=28) + dt.timedelta(days=1)
    key = "NSE_INDEX|Nifty 50"
    url = f"https://api.upstox.com/v3/historical-candle/{quote(key, safe='')}/days/1/{end}/{start}"
    response = market_data_get(
        url, {"Accept": "application/json", "Authorization": f"Bearer {token}"}
    )
    if (
        not isinstance(response, dict)
        or response.get("status") != "success"
        or not isinstance(response.get("data"), dict)
    ):
        raise ValueError("benchmark source unavailable")
    rows = _parse_bars(response["data"].get("candles"), epoch=False)
    bars = []
    seen = set()
    for bar in rows:
        date = bar.timestamp.astimezone(IST).date()
        if not start <= date <= end or date in seen:
            raise ValueError("unexpected benchmark coverage")
        seen.add(date)
        bars.append(
            {
                "time": bar.timestamp.astimezone(IST).isoformat(),
                "open": float(bar.open),
                "high": float(bar.high),
                "low": float(bar.low),
                "close": float(bar.close),
                "volume": bar.volume,
            }
        )
    if not bars:
        raise ValueError("empty benchmark history")
    coverage = []
    for period in ("1M", "1Y", "5Y", "10Y"):
        reason = (
            "Dated full-universe pre-entry volume and membership evidence is incomplete; "
            "no verified strategy return"
        )
        if period in {"5Y", "10Y"}:
            reason = (
                "Upstox minute history starts in 2022; complete requested intraday "
                "period and dated universe are unavailable"
            )
        coverage.append(
            {
                "period": period,
                "status": "MISSING_REQUIRED_INTRADAY_EVIDENCE",
                "reason": reason,
                "completedSessions": None,
                "netPnlINR": None,
            }
        )
    return {
        "schema": "atlas.scalpstorm-history.v1",
        "observedAt": dt.datetime.now(dt.UTC).isoformat(),
        "realOrdersEnabled": False,
        "actualCapitalINR": 0,
        "prices": {
            "instrumentKey": key,
            "symbol": "NIFTY 50",
            "source": "Upstox Analytics V3 / days / 1",
            "requestedFrom": str(start),
            "requestedTo": str(end),
            "firstDate": bars[0]["time"][:10],
            "lastDate": bars[-1]["time"][:10],
            "bars": bars,
            "sourcePayloadSHA256": hashlib.sha256(
                json.dumps(response, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest(),
        },
        "strategyCoverage": coverage,
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--upstox-credential-file", required=True, type=Path)
    p.add_argument("--state-dir", required=True, type=Path)
    args = p.parse_args()
    private_directory(args.state_dir)
    result = build_history(read_analytics_credential(args.upstox_credential_file))
    path = args.state_dir / "scalpstorm-history.json"
    if path.exists() and not path.is_symlink() and path.stat().st_size < 1_500_000:
        previous = json.loads(path.read_text())
        if (
            previous.get("schema") == "atlas.scalpstorm-history.v1"
            and previous.get("realOrdersEnabled") is False
            and isinstance(previous.get("replay"), dict)
        ):
            result["replay"] = previous["replay"]
    save_snapshot(path, result)
    print(
        json.dumps(
            {
                "dailyBars": len(result["prices"]["bars"]),
                "firstDate": result["prices"]["firstDate"],
                "lastDate": result["prices"]["lastDate"],
                "strategyReturnsFabricated": False,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
