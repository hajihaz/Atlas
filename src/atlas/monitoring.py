"""Operational health primitives; critical failures are fail-closed signals."""

from dataclasses import dataclass
from enum import StrEnum


class Severity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass(frozen=True)
class Alert:
    code: str
    severity: Severity
    message: str


@dataclass(frozen=True)
class HealthReport:
    data_fresh: bool = True
    reconciliation_healthy: bool = True
    ledger_healthy: bool = True
    broker_healthy: bool = True
    risk_healthy: bool = True
    emergency_clear: bool = True

    @property
    def healthy(self) -> bool:
        return all(
            (
                self.data_fresh,
                self.reconciliation_healthy,
                self.ledger_healthy,
                self.broker_healthy,
                self.risk_healthy,
                self.emergency_clear,
            )
        )

    def assert_healthy(self) -> None:
        if not self.healthy:
            raise RuntimeError("operational health gate blocked")


def reconciliation_alert(code: str, message: str) -> Alert:
    return Alert(code, Severity.CRITICAL, message)
