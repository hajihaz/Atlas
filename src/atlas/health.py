"""Deterministic operational-health aggregation."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


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
        if self.blockers:
            raise RuntimeError("capital-increasing action blocked: " + ", ".join(self.blockers))


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
