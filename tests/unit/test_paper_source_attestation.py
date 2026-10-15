import datetime as dt
from dataclasses import replace

import pytest

from atlas.research.gates import GateVerdict
from atlas.research.paper_source_attestation import (
    RecordedPaperAttestation,
    sign_recorded_paper_receipt,
    verify_recorded_paper_receipt,
)
from atlas.research.promotion import PaperEvidence, evaluate_paper_promotion


def _receipt():
    first = dt.datetime(2026, 1, 1, tzinfo=dt.UTC)
    last = dt.datetime(2026, 2, 1, tzinfo=dt.UTC)
    return RecordedPaperAttestation(
        "trusted-fixture-issuer", first, last, 30, "research", "ledger", "market-hash"
    )


def _paper(receipt):
    return PaperEvidence(
        30,
        "research",
        "ledger",
        True,
        market_source_type="recorded_external_paper",
        market_session_provenance_hash="market-hash",
        source_attestation=receipt,
    )


def test_unsigned_or_unknown_key_never_promotes_external_paper():
    receipt = _receipt()
    valid_research = GateVerdict(True, {}, ())
    assert not evaluate_paper_promotion(valid_research, _paper(receipt)).passed
    signed = sign_recorded_paper_receipt(receipt, signing_key=b"unit-test-only-issuer")
    assert not evaluate_paper_promotion(valid_research, _paper(signed)).passed
    assert not evaluate_paper_promotion(
        valid_research, _paper(signed), verifier_key=b"wrong"
    ).passed
    assert evaluate_paper_promotion(
        valid_research, _paper(signed), verifier_key=b"unit-test-only-issuer"
    ).passed


def test_tampered_session_count_market_hash_ledger_and_identity_fail():
    signed = sign_recorded_paper_receipt(_receipt(), signing_key=b"fixture")
    assert verify_recorded_paper_receipt(signed, verifier_key=b"fixture")
    for tampered in (
        replace(signed, session_count=31),
        replace(signed, market_sessions_hash="other"),
        replace(signed, ledger_hash="other"),
        replace(signed, provider="another-provider"),
    ):
        assert not verify_recorded_paper_receipt(tampered, verifier_key=b"fixture")
    assert not evaluate_paper_promotion(
        GateVerdict(True, {}, ()),
        replace(_paper(signed), market_session_provenance_hash="different"),
        verifier_key=b"fixture",
    ).passed


def test_zero_sessions_and_bad_clock_are_not_signable():
    with pytest.raises(ValueError):
        sign_recorded_paper_receipt(replace(_receipt(), session_count=0), signing_key=b"x")
    with pytest.raises(ValueError):
        sign_recorded_paper_receipt(
            replace(_receipt(), first_session=dt.datetime(2026, 2, 2, tzinfo=dt.UTC)),
            signing_key=b"x",
        )
