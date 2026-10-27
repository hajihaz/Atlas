"""QuantStats cross-checks using actual recorded valuation timestamps."""

from __future__ import annotations

from typing import Any


def observed_daily_drawdown(account: dict[str, Any]) -> dict[str, Any]:
    import pandas as pd  # type: ignore[import-untyped]
    import quantstats as qs

    values = {pd.Timestamp(account["createdAt"]): account["virtualCapitalINR"]}
    for row in account["daily"]:
        if row.get("closingEquityINR") is not None and row.get("lastObservationAt"):
            values[pd.Timestamp(row["lastObservationAt"])] = row["closingEquityINR"]
    if any(type(v) not in (int, float) or not 0 < v < 1e12 for v in values.values()):
        raise ValueError("Valid observed equity is required")
    series = pd.Series(values, dtype=float).sort_index()
    result = float(qs.stats.max_drawdown(series)) if len(series) > 1 else 0.0
    return {
        "strategyId": account["id"],
        "dailyObservedDrawdownPct": -result * 100,
        "recordedDays": len(account["daily"]),
        "annualizedMetricsCertified": False,
        "profitableStrategyCertified": False,
        "scope": "Recorded day-end marks after recorded fees only",
    }
