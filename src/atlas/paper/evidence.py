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
    observations_hash: str = ""


def seal_paper_evidence(
    evidence: MultiSessionEvidence,
    *,
    strategy_version: str,
    data_snapshot_hash: str,
    configuration: object,
) -> PaperEvidenceEnvelope:
    if not strategy_version or not data_snapshot_hash:
        raise ValueError("strategy version and data snapshot hash are required")
    if (
        evidence.sessions_requested != len(evidence.observations)
        or evidence.sessions_completed != sum(o.error is None for o in evidence.observations)
        or evidence.runtime_errors != sum(o.error is not None for o in evidence.observations)
        or evidence.clean_reconciliations != all(o.reconciled for o in evidence.observations)
        or len({o.session_id for o in evidence.observations}) != len(evidence.observations)
        or any(o.reconciled and o.error is not None for o in evidence.observations)
    ):
        raise ValueError("paper observation counts or identities diverge")
    reconciliation_hash = content_hash(
        [
            {"session": o.session_id, "reconciled": o.reconciled, "error": o.error}
            for o in evidence.observations
        ]
    )
    observations_hash = content_hash(
        [
            {
                "session_id": o.session_id,
                "equity": o.equity,
                "checkpoint": o.checkpoint,
                "reconciled": o.reconciled,
                "error": o.error,
            }
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
        "observations_hash": observations_hash,
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
        observations_hash,
    )


def verify_paper_evidence(envelope: PaperEvidenceEnvelope) -> bool:
    raw = asdict(envelope)
    expected = raw.pop("evidence_hash")
    return bool(content_hash(raw) == expected)


def verify_paper_evidence_against_sources(
    envelope: PaperEvidenceEnvelope,
    evidence: MultiSessionEvidence,
    *,
    strategy_version: str,
    data_snapshot_hash: str,
    configuration: object,
) -> bool:
    """Recompute the proof using the original observations and claimed inputs."""
    if not verify_paper_evidence(envelope):
        return False
    try:
        return envelope == seal_paper_evidence(
            evidence,
            strategy_version=strategy_version,
            data_snapshot_hash=data_snapshot_hash,
            configuration=configuration,
        )
    except (ValueError, TypeError):
        return False
