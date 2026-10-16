"""Deterministic operational-health aggregation."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from atlas.operations_hardening import DurableEmergencyStore


class HealthStatus(StrEnum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    BLOCKED = "blocked"


@dataclass(frozen=True)
class HealthSignal:
    name: str
    healthy: bool
    detail: str = ""
    capital_blocking: bool = True


@dataclass(frozen=True)
class HealthReport:
    status: HealthStatus
    signals: tuple[HealthSignal, ...]

    @property
    def blockers(self) -> tuple[str, ...]:
        return tuple(s.name for s in self.signals if not s.healthy and s.capital_blocking)

    def assert_capital_safe(self) -> None:
        names = [item.name for item in self.signals]
        structurally_invalid = (
            not self.signals
            or any(not name or not name.strip() for name in names)
            or len(names) != len(set(names))
            or any(type(item.healthy) is not bool for item in self.signals)
            or any(type(item.capital_blocking) is not bool for item in self.signals)
            or self.status != evaluate_health(self.signals).status
        )
        if structurally_invalid or self.status == HealthStatus.BLOCKED or self.blockers:
            reasons = self.blockers or ("missing_or_blocked_health_evidence",)
            raise RuntimeError("capital-increasing action blocked: " + ", ".join(reasons))


def evaluate_health(signals: tuple[HealthSignal, ...]) -> HealthReport:
    if not signals:
        return HealthReport(HealthStatus.BLOCKED, ())
    blocking = any(not s.healthy and s.capital_blocking for s in signals)
    degraded = any(not s.healthy for s in signals)
    status = (
        HealthStatus.BLOCKED
        if blocking
        else HealthStatus.DEGRADED
        if degraded
        else HealthStatus.HEALTHY
    )
    return HealthReport(status, signals)


def assert_operational_clear(
    emergency_store: DurableEmergencyStore | None,
    health: HealthReport | None,
    *,
    require_proofs: bool = False,
) -> None:
    """Check halt state and health immediately before creating/submitting an order."""
    if require_proofs and (emergency_store is None or health is None):
        raise RuntimeError("mandatory emergency and health proofs are unavailable")
    if emergency_store is not None:
        emergency_store.assert_clear()
    if health is not None:
        health.assert_capital_safe()
