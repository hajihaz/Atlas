"""Final fail-closed gate for any future live-capital enablement.

This module does not place orders, select a broker, or activate live mode.
It only proves that every independently supplied prerequisite is present.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class LiveGateStatus(StrEnum):
    BLOCKED = "blocked"
    READY = "ready"


@dataclass(frozen=True)
class LiveReadiness:
    strategy_evidence: bool = False
    point_in_time_data: bool = False
    risk_approved: bool = False
    paper_certified: bool = False
    reconciliation_healthy: bool = False
    monitoring_healthy: bool = False
    kill_switch_tested: bool = False
    security_audit_passed: bool = False
    dependency_audit_passed: bool = False
    production_broker_selected: bool = False
    production_credentials_isolated: bool = False
    production_deployment_ready: bool = False
    compliance_reviewed: bool = False
    human_authorization: bool = False
    governance_live_mode: bool = False

    @property
    def status(self) -> LiveGateStatus:
        return LiveGateStatus.READY if self.all_passed else LiveGateStatus.BLOCKED

    @property
    def all_passed(self) -> bool:
        return all(vars(self).values())

    @property
    def blockers(self) -> tuple[str, ...]:
        return tuple(name for name, passed in vars(self).items() if not passed)

    def assert_ready(self) -> None:
        if not self.all_passed:
            raise RuntimeError(
                "live-capital enablement denied; unresolved gates: " + ", ".join(self.blockers)
            )


def evaluate_live_readiness(readiness: LiveReadiness) -> LiveReadiness:
    """Return the supplied readiness state without mutating or authorizing it."""
    return readiness
