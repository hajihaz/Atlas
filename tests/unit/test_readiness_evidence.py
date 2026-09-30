from atlas.governance.readiness_evidence import InternalReadinessEvidence
from atlas.health import HealthSignal, evaluate_health
from atlas.research.promotion import PromotionVerdict


def test_internal_evidence_cannot_set_owner_or_external_live_gates() -> None:
    promotion = PromotionVerdict(True, {"research_validated": True}, ())
    evidence = InternalReadinessEvidence(
        promotion, True, True, True,
        evaluate_health((HealthSignal("all", True),)),
        True, True, True, True,
    )
    readiness = evidence.to_live_readiness()
    assert readiness.strategy_evidence
    assert readiness.paper_certified
    assert readiness.production_deployment_ready
    assert not readiness.production_broker_selected
    assert not readiness.production_credentials_isolated
    assert not readiness.compliance_reviewed
    assert not readiness.human_authorization
    assert not readiness.governance_live_mode
    assert not readiness.all_passed


def test_degraded_monitoring_never_becomes_live_healthy() -> None:
    promotion = PromotionVerdict(True, {"research_validated": True}, ())
    evidence = InternalReadinessEvidence(
        promotion, True, True, True,
        evaluate_health((HealthSignal("reporting", False, capital_blocking=False),)),
        True, True, True,
    )
    assert not evidence.to_live_readiness().monitoring_healthy
