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
