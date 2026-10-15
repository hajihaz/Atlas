"""Accounting and broker reconciliation contracts."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class ReconciliationResult:
    matched: bool
    cash_delta: Decimal
    position_deltas: Mapping[str, int]
    reasons: tuple[str, ...] = ()


def reconcile(
    *,
    atlas_cash: Decimal,
    broker_cash: Decimal,
    atlas_positions: Mapping[str, int],
    broker_positions: Mapping[str, int],
    tolerance: Decimal = Decimal("0.01"),
    atlas_equity: Decimal | None = None,
    broker_equity: Decimal | None = None,
    atlas_fees: Decimal | None = None,
    broker_fees: Decimal | None = None,
) -> ReconciliationResult:
    monetary_values = {
        "atlas_cash": atlas_cash,
        "broker_cash": broker_cash,
        "tolerance": tolerance,
    }
    for label, value in (
        ("atlas_equity", atlas_equity),
        ("broker_equity", broker_equity),
        ("atlas_fees", atlas_fees),
        ("broker_fees", broker_fees),
    ):
        if value is not None:
            monetary_values[label] = value
    if any(not amount.is_finite() for amount in monetary_values.values()):
        return ReconciliationResult(False, Decimal("0"), {}, ("non_finite_account_observation",))
    if tolerance < 0:
        raise ValueError("reconciliation tolerance cannot be negative")
    if any(type(q) is not int for q in (*atlas_positions.values(), *broker_positions.values())):
        return ReconciliationResult(False, Decimal("0"), {}, ("invalid_position_observation",))
    cash_delta = broker_cash - atlas_cash
    keys = sorted(set(atlas_positions) | set(broker_positions))
    deltas = {k: broker_positions.get(k, 0) - atlas_positions.get(k, 0) for k in keys}
    deltas = {k: v for k, v in deltas.items() if v}
    reasons = [] if abs(cash_delta) <= tolerance else ["cash_mismatch"]
    if deltas:
        reasons.append("position_mismatch")
    if (atlas_equity is None) != (broker_equity is None):
        reasons.append("equity_observation_incomplete")
    elif atlas_equity is not None and broker_equity is not None:
        if abs(broker_equity - atlas_equity) > tolerance:
            reasons.append("equity_mismatch")
    if (atlas_fees is None) != (broker_fees is None):
        reasons.append("fee_observation_incomplete")
    elif atlas_fees is not None and broker_fees is not None:
        if abs(broker_fees - atlas_fees) > tolerance:
            reasons.append("fee_mismatch")
    return ReconciliationResult(not reasons, cash_delta, deltas, tuple(reasons))
