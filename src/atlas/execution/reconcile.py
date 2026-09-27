"""Cross-engine golden reconciliation helpers."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal

from .simulator import Fill, OrderIntent


@dataclass(frozen=True)
class GoldenReconciliation:
    contract_match: bool
    order_match: bool
    fill_match: bool
    equity_match: bool
    differences: tuple[str, ...] = ()

    @property
    def passed(self) -> bool:
        return self.contract_match and self.order_match and self.fill_match and self.equity_match


def compare_equity(
    actual: Decimal, expected: Decimal, tolerance: Decimal = Decimal("0.01")
) -> bool:
    return abs(actual - expected) <= tolerance


def compare_order_intents(
    actual: Sequence[OrderIntent], expected: Sequence[OrderIntent]
) -> tuple[bool, tuple[str, ...]]:
    a = [(x.instrument_id, x.quantity, x.reference_price, x.target_weight) for x in actual]
    e = [(x.instrument_id, x.quantity, x.reference_price, x.target_weight) for x in expected]
    return a == e, () if a == e else (f"order_intents differ: actual={a!r} expected={e!r}",)


def compare_fills(
    actual: Sequence[Fill],
    expected: Sequence[Fill],
    *,
    price_tolerance: Decimal = Decimal("0.000001"),
    fee_tolerance: Decimal = Decimal("0.000001"),
) -> tuple[bool, tuple[str, ...]]:
    if len(actual) != len(expected):
        return False, (f"fill count differs: actual={len(actual)} expected={len(expected)}",)
    differences: list[str] = []
    for i, (a, e) in enumerate(zip(actual, expected, strict=False)):
        if a.instrument_id != e.instrument_id or a.quantity != e.quantity:
            differences.append(f"fill {i} identity differs")
        if abs(a.fill_price - e.fill_price) > price_tolerance:
            differences.append(f"fill {i} price differs")
        if abs(a.fee - e.fee) > fee_tolerance:
            differences.append(f"fill {i} fee differs")
    return not differences, tuple(differences)
