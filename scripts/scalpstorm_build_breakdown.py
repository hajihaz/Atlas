#!/usr/bin/env python3
"""Build a public, no-fiction ScalpStorm X daily ledger for Atlas and ChatGPT.

This is an explanation of 10 equal slots, plus research-only session labels.
Unknown stocks/P&L remain null; zero capital allocation does not imply zero returns.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INFILE = ROOT / "frontend/src/data/scalpstorm-campaign.json"
PUBLIC = ROOT / "frontend/public"
CAPITAL = 100_000
POSITIONS = 10


def build(campaign: dict) -> dict:
    if (
        campaign.get("capitalINR") != CAPITAL
        or campaign.get("expectedSessions") != 20
        or len(campaign.get("days", [])) != 20
        or campaign.get("liveCapitalBlocked") is not True
    ):
        raise ValueError("campaign capital/date/lock mismatch")
    counts = Counter(day["indexSignal"] for day in campaign["days"])
    if dict(counts) != campaign["signalCounts"]:
        raise ValueError("source index signal totals do not reconcile")
    recorded_days = []
    for day in campaign["days"]:
        if (
            day.get("status") != "INDEX_SIGNAL_RECONSTRUCTED_STOCK_DATA_MISSING"
            or day.get("trades") is not None
            or day.get("netPnl") is not None
            or day.get("selected") is not None
        ):
            raise ValueError("unexpected potentially genuine stock trade records; review required")
        recorded_days.append(
            {
                "date": day["date"],
                "indexSignal": day["indexSignal"],
                "niftyOpeningChangePct": day["niftyOpeningChangePct"],
                "equityMinuteSource": "community_source_not_exchange_attested",
                "tradingStatus": (
                    "NO_TRADE_UNDER_INDEX_FILTER"
                    if day["indexSignal"] == "NO_TRADE"
                    else "10_STOCKS_RANKING_AWAITING_POINT_IN_TIME_MARKET_DATA"
                ),
                "capitalAvailableINR": CAPITAL,
                "capitalPerReservedSlotINR": CAPITAL // POSITIONS,
                "verifiedStockCount": 0,
                "grossPnlINR": None,
                "feesINR": None,
                "netPnlINR": None,
                "slots": [
                    {
                        "slot": i,
                        "reservedCashINR": CAPITAL // POSITIONS,
                        "potentialNotional1xINR": CAPITAL // POSITIONS,
                        "stock": None,
                        "shares": None,
                        "entry": None,
                        "exit": None,
                        "grossPnl": None,
                        "fees": None,
                        "netPnl": None,
                    }
                    for i in range(1, POSITIONS + 1)
                ],
            }
        )
    return {
        "reportKind": "EVIDENCE_LIMITED_STOCK_LEDGER",
        "virtualCapitalINR": CAPITAL,
        "allocation": {
            "stocksPerDirectionalDay": POSITIONS,
            "reservedCashPerStockINR": CAPITAL // POSITIONS,
            "default1xMarketExposureINR": CAPITAL,
            "marginScenariosEducationOnly": [
                {
                    "multiplier": v,
                    "perStockNotionalINR": (CAPITAL // POSITIONS) * v,
                    "totalNotionalINR": CAPITAL * v,
                    "liveMarginEnabled": False,
                }
                for v in (1, 2, 5)
            ],
        },
        "window": {
            "from": campaign["windowStart"],
            "to": campaign["windowEnd"],
            "sessions": campaign["expectedSessions"],
        },
        "indexSignalCounts": campaign["signalCounts"],
        "stockTradeDaysVerified": campaign["verifiedSessions"],
        "actualRealizedPnlINR": None,
        "monthlyGrossPnlINR": None,
        "monthlyFeesINR": None,
        "winningTradeRate": None,
        "maxDrawdown": None,
        "topRecurringStocks": None,
        "liveCapitalBlocked": True,
        "source": campaign["indexSource"],
        "days": recorded_days,
        "notFinancialResults": (
            "Opening NIFTY direction signals and hypothetical margin calculations are "
            "not evidence of selected stock trades, actual Groww fills, or past profits."
        ),
    }


def as_text(document: dict) -> str:
    a = document["allocation"]
    counts = document["indexSignalCounts"]
    lines = [
        "ATLAS / SCALPSTORM X — 20-DAY STOCK LEDGER (DATA STATUS REPORT)",
        f"Virtual capital: ₹{document['virtualCapitalINR']:,} | "
        f"{a['stocksPerDirectionalDay']} slots x ₹{a['reservedCashPerStockINR']:,}",
        "Baseline 1x: ₹10,000 exposure/stock; ₹1,00,000 total exposure.",
        "Margin scenarios only: 2x ₹20,000/stock (₹2L total), "
        "5x ₹50,000/stock (₹5L total). Real capital and margin are BLOCKED.",
        "Direction rule: community NIFTY 9:15 to 9:29, +/-0.15% research threshold.",
        f"20 NIFTY sessions: {counts['BUY']} BUY, {counts['SELL']} SELL, "
        f"{counts['NO_TRADE']} NO TRADE.",
        "Verified stock executions: 0/20 days, zero verified stock names.",
        "Day/month profit, loss, brokerage and win rate: UNAVAILABLE, not zero.",
        "For every directional day, 10 reserved slots have UNAVAILABLE "
        "stock name, shares, entry, exit, gross P&L, fees and net P&L.",
        "NO TRADE signal days: filter would skip the market; these are not brokerage executions.",
        "",
        "DATE         INDEX SIGNAL  NIFTY OPEN %     VERIFIED STOCKS   STOCK NET P&L",
    ]
    for d in document["days"]:
        change = float(d["niftyOpeningChangePct"])
        lines.append(
            f"{d['date']}   {d['indexSignal']:<9}    {change:+.4f}%          "
            f"0/10              UNAVAILABLE"
        )
    lines += [
        "",
        "The Atlas day-detail page contains 10 explicit virtual slots and "
        "a separate margin, cost and slippage WHAT-IF calculator.",
        "NIFTY source is a community dataset, not independently NSE-attested.",
        "NEEDED: Sept-Oct 2026 licensed full NSE equity 1-minute data and "
        "time-correct eligible universe; never substitute end-of-day leaders.",
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    report = build(json.loads(INFILE.read_text(encoding="utf-8")))
    PUBLIC.mkdir(parents=True, exist_ok=True)
    (PUBLIC / "scalpstorm-breakdown.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (PUBLIC / "scalpstorm-breakdown.txt").write_text(as_text(report), encoding="utf-8")
    print(
        f"Breakdown generated: {len(report['days'])} days, "
        "10 blank slots/day, zero invented results"
    )


if __name__ == "__main__":
    main()
