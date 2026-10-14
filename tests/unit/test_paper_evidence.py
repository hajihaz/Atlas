from dataclasses import replace
from decimal import Decimal

from atlas.paper.evidence import seal_paper_evidence, verify_paper_evidence
from atlas.paper.validation import MultiSessionEvidence, SessionObservation


def test_paper_evidence_binds_strategy_data_config_ledger_and_reconciliation() -> None:
    evidence = MultiSessionEvidence(
        1, 1, (SessionObservation("s", Decimal("101"), (2, "abc"), True),), True, 0
    )
    sealed = seal_paper_evidence(
        evidence,
        strategy_version="git:123",
        data_snapshot_hash="data:456",
        configuration={"risk": "v1"},
    )
    assert verify_paper_evidence(sealed)
    assert not verify_paper_evidence(replace(sealed, ledger_hash="tampered"))
    assert not verify_paper_evidence(replace(sealed, strategy_version="git:other"))


def test_paper_evidence_rejects_changed_underlying_session_and_configuration() -> None:
    from atlas.paper.evidence import verify_paper_evidence_against_sources

    observations = (SessionObservation("session-1", Decimal("101"), (1, "ledger"), True),)
    evidence = MultiSessionEvidence(1, 1, observations, True, 0)
    config = {"fee": "0.001", "max_drawdown": "0.1"}
    envelope = seal_paper_evidence(
        evidence, strategy_version="git:abc", data_snapshot_hash="sha:dataset", configuration=config
    )
    inputs = {
        "strategy_version": "git:abc",
        "data_snapshot_hash": "sha:dataset",
        "configuration": config,
    }
    assert verify_paper_evidence_against_sources(envelope, evidence, **inputs)
    changed = MultiSessionEvidence(
        1, 1, (replace(observations[0], equity=Decimal("999")),), True, 0
    )
    assert not verify_paper_evidence_against_sources(envelope, changed, **inputs)
    assert not verify_paper_evidence_against_sources(
        envelope, evidence, **{**inputs, "configuration": {"fee": "0"}}
    )
    assert not verify_paper_evidence_against_sources(
        envelope, evidence, **{**inputs, "data_snapshot_hash": "different-data"}
    )


def test_paper_evidence_rejects_inconsistent_and_duplicate_sessions() -> None:
    import pytest

    observations = (
        SessionObservation("same-id", Decimal("100"), (1, "abc"), True),
        SessionObservation("same-id", Decimal("101"), (2, "def"), True),
    )
    evidence = MultiSessionEvidence(2, 2, observations, True, 0)
    with pytest.raises(ValueError, match="observation"):
        seal_paper_evidence(
            evidence, strategy_version="strategy", data_snapshot_hash="hash", configuration={}
        )
