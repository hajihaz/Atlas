"""Evidence-backed construction of live-readiness inputs.

This layer prevents callers from turning internal Atlas gates green with naked booleans.
External/owner gates remain explicit and cannot be manufactured here.
"""
from __future__ import annotations

from dataclasses import dataclass

from atlas.governance.live_gate import LiveReadiness
from atlas.health import HealthReport, HealthStatus
from atlas.research.promotion import PromotionVerdict


@dataclass(frozen=True)
class InternalReadinessEvidence:
    promotion: PromotionVerdict
    point_in_time_data: bool
    risk_approved: bool
    reconciliation_healthy: bool
    monitoring: HealthReport
    kill_switch_tested: bool
    security_audit_passed: bool
    dependency_audit_passed: bool
    production_deployment_ready: bool = False

    def to_live_readiness(self) -> LiveReadiness:
        return LiveReadiness(
            strategy_evidence=self.promotion.checks.get("research_validated", False),
            point_in_time_data=self.point_in_time_data,
            risk_approved=self.risk_approved,
            paper_certified=self.promotion.passed,
            reconciliation_healthy=self.reconciliation_healthy,
            monitoring_healthy=self.monitoring.status == HealthStatus.HEALTHY,
            kill_switch_tested=self.kill_switch_tested,
            security_audit_passed=self.security_audit_passed,
            dependency_audit_passed=self.dependency_audit_passed,
            production_deployment_ready=self.production_deployment_ready,
        )
