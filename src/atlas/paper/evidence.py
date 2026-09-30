"""Cryptographically traceable paper-validation evidence."""

from __future__ import annotations

from dataclasses import asdict, dataclass

from atlas.common.hashing import content_hash
from atlas.paper.validation import MultiSessionEvidence


@dataclass(frozen=True)
class PaperEvidenceEnvelope:
    strategy_version: str
    data_snapshot_hash: str
    configuration_hash: str
    ledger_hash: str
    reconciliation_hash: str
    sessions_requested: int
    sessions_completed: int
    runtime_errors: int
    evidence_hash: str


def seal_paper_evidence(
    evidence: MultiSessionEvidence,
    *,
    strategy_version: str,
    data_snapshot_hash: str,
    configuration: object,
) -> PaperEvidenceEnvelope:
    if not strategy_version or not data_snapshot_hash:
        raise ValueError("strategy version and data snapshot hash are required")
    reconciliation_hash = content_hash(
        [
            {"session": o.session_id, "reconciled": o.reconciled, "error": o.error}
            for o in evidence.observations
        ]
    )
    configuration_hash = content_hash(configuration)
    ledger_hash = evidence.ledger_head[1]
    base = {
        "strategy_version": strategy_version,
        "data_snapshot_hash": data_snapshot_hash,
        "configuration_hash": configuration_hash,
        "ledger_hash": ledger_hash,
        "reconciliation_hash": reconciliation_hash,
        "sessions_requested": evidence.sessions_requested,
        "sessions_completed": evidence.sessions_completed,
        "runtime_errors": evidence.runtime_errors,
    }
    return PaperEvidenceEnvelope(
        strategy_version,
        data_snapshot_hash,
        configuration_hash,
        ledger_hash,
        reconciliation_hash,
        evidence.sessions_requested,
        evidence.sessions_completed,
        evidence.runtime_errors,
        content_hash(base),
    )


def verify_paper_evidence(envelope: PaperEvidenceEnvelope) -> bool:
    raw = asdict(envelope)
    expected = raw.pop("evidence_hash")
    return bool(content_hash(raw) == expected)
