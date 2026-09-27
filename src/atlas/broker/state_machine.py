"""Fail-closed broker order-state transition validation."""

from __future__ import annotations

from atlas.broker.adapter import BrokerOrderStatus

_ALLOWED: dict[BrokerOrderStatus, frozenset[BrokerOrderStatus]] = {
    BrokerOrderStatus.UNKNOWN: frozenset(
        {
            BrokerOrderStatus.ACCEPTED,
            BrokerOrderStatus.REJECTED,
            BrokerOrderStatus.CANCELLED,
            BrokerOrderStatus.PARTIALLY_FILLED,
            BrokerOrderStatus.FILLED,
        }
    ),
    BrokerOrderStatus.ACCEPTED: frozenset(
        {
            BrokerOrderStatus.ACCEPTED,
            BrokerOrderStatus.PARTIALLY_FILLED,
            BrokerOrderStatus.FILLED,
            BrokerOrderStatus.CANCELLED,
            BrokerOrderStatus.REJECTED,
        }
    ),
    BrokerOrderStatus.PARTIALLY_FILLED: frozenset(
        {
            BrokerOrderStatus.PARTIALLY_FILLED,
            BrokerOrderStatus.FILLED,
            BrokerOrderStatus.CANCELLED,
        }
    ),
    BrokerOrderStatus.FILLED: frozenset({BrokerOrderStatus.FILLED}),
    BrokerOrderStatus.CANCELLED: frozenset({BrokerOrderStatus.CANCELLED}),
    BrokerOrderStatus.REJECTED: frozenset({BrokerOrderStatus.REJECTED}),
}


def validate_transition(previous: BrokerOrderStatus, observed: BrokerOrderStatus) -> None:
    """Reject impossible regressions while allowing idempotent repeated observations."""
    if observed not in _ALLOWED[previous]:
        raise RuntimeError(f"illegal broker order transition: {previous.value} -> {observed.value}")
