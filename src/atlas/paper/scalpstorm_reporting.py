"""Presentation totals include every recorded day, including unresolved losses."""

from __future__ import annotations

from typing import Any


def period_totals(days: list[dict[str, Any]], width: int) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for day in days:
        if "endingEquityPaise" in day:
            groups.setdefault(day["date"][:width], []).append(day)
    result = []
    for period, rows in sorted(groups.items(), reverse=True):
        rows.sort(key=lambda row: row["date"])
        pnl = sum(row["endingEquityPaise"] - row["startingEquityPaise"] for row in rows)
        complete = sum(row.get("complete") is True for row in rows)
        result.append(
            {
                "period": period,
                "recordedSessions": len(rows),
                "completedSessions": complete,
                "incompleteSessions": len(rows) - complete,
                "firstSession": rows[0]["date"],
                "lastSession": rows[-1]["date"],
                "netPnlINR": pnl / 100,
                "returnPct": pnl * 100 / rows[0]["startingEquityPaise"]
                if rows[0]["startingEquityPaise"] > 0
                else None,
                "feesINR": sum(row["feesPaise"] for row in rows) / 100,
                "fills": sum(row["fills"] for row in rows),
                "coverage": (
                    "All recorded days, including incomplete-session marks; "
                    "not a full calendar-period or realized-only return"
                ),
            }
        )
    return result


def with_period_totals(report: dict[str, Any]) -> dict[str, Any]:
    return {
        **report,
        "monthly": period_totals(report["days"], 7),
        "yearly": period_totals(report["days"], 4),
    }
