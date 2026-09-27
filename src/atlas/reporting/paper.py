"""Deterministic paper-performance reporting primitives."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from math import sqrt


@dataclass(frozen=True)
class PaperReport:
    observations: int
    start_equity: Decimal
    end_equity: Decimal
    total_return: Decimal
    max_drawdown: Decimal
    sharpe: Decimal
    reconciliation_failures: int
    turnover: Decimal = Decimal("0")
    fees: Decimal = Decimal("0")
    fills: int = 0
    rejected_orders: int = 0


def build_paper_report(
    equity: Sequence[Decimal],
    *,
    periods_per_year: int = 252,
    reconciliation_failures: int = 0,
    turnover: Decimal = Decimal("0"),
    fees: Decimal = Decimal("0"),
    fills: int = 0,
    rejected_orders: int = 0,
) -> PaperReport:
    if not equity or any(x <= 0 for x in equity):
        raise ValueError("paper equity observations must be positive and non-empty")
    if (
        periods_per_year <= 0
        or reconciliation_failures < 0
        or turnover < 0
        or fees < 0
        or fills < 0
        or rejected_orders < 0
    ):
        raise ValueError("invalid reporting parameters")
    returns = [(equity[i] / equity[i - 1]) - Decimal("1") for i in range(1, len(equity))]
    peak = equity[0]
    max_dd = Decimal("0")
    for value in equity:
        peak = max(peak, value)
        max_dd = max(max_dd, Decimal("1") - value / peak)
    if not returns:
        sharpe = Decimal("0")
    else:
        mean = sum(returns, Decimal("0")) / Decimal(len(returns))
        variance = sum((r - mean) ** 2 for r in returns) / Decimal(len(returns))
        sharpe = (
            Decimal("0")
            if variance == 0
            else mean / Decimal(str(sqrt(float(variance)))) * Decimal(str(sqrt(periods_per_year)))
        )
    return PaperReport(
        len(equity),
        equity[0],
        equity[-1],
        equity[-1] / equity[0] - Decimal("1"),
        max_dd,
        sharpe,
        reconciliation_failures,
        turnover,
        fees,
        fills,
        rejected_orders,
    )
