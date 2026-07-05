"""The hash-chained trial ledger."""

from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass, field
from typing import Any, Mapping

from atlas.common.errors import LedgerIntegrityError
from atlas.common.hashing import GENESIS_HASH, chain_hash, content_hash
from atlas.common.time_utils import require_aware, to_utc
from atlas.common.types import TrialStatus
from atlas.trials.store import InMemoryLedgerStore, LedgerStore


@dataclass(frozen=True)
class TrialRecord:
    """One recorded state of a trial. A trial's history is a sequence of these (append-only);
    a status change appends a new record for the same ``trial_id`` rather than mutating.
    """

    trial_id: str
    family_id: str
    status: TrialStatus
    recorded_at: _dt.datetime
    spec: Mapping[str, Any] = field(default_factory=dict)
    data_snapshot_id: str | None = None
    seed: int | None = None
    code_version: str | None = None
    metrics: Mapping[str, Any] = field(default_factory=dict)
    verdict: str | None = None
    note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "trial_id": self.trial_id,
            "family_id": self.family_id,
            "status": self.status.value,
            "recorded_at": to_utc(self.recorded_at).isoformat(),
            "spec": dict(self.spec),
            "data_snapshot_id": self.data_snapshot_id,
            "seed": self.seed,
            "code_version": self.code_version,
            "metrics": dict(self.metrics),
            "verdict": self.verdict,
            "note": self.note,
        }

    @staticmethod
    def from_dict(d: Mapping[str, Any]) -> TrialRecord:
        return TrialRecord(
            trial_id=d["trial_id"],
            family_id=d["family_id"],
            status=TrialStatus(d["status"]),
            recorded_at=_dt.datetime.fromisoformat(d["recorded_at"]),
            spec=dict(d.get("spec", {})),
            data_snapshot_id=d.get("data_snapshot_id"),
            seed=d.get("seed"),
            code_version=d.get("code_version"),
            metrics=dict(d.get("metrics", {})),
            verdict=d.get("verdict"),
            note=d.get("note"),
        )


@dataclass(frozen=True)
class LedgerEntry:
    seq: int
    record: TrialRecord
    record_hash: str
    prev_hash: str
    chain_hash: str


class TrialLedger:
    """Append-only, hash-chained ledger of trial records.

    Tamper-evidence: each entry commits to the previous via ``chain_hash``. Any later edit
    to an earlier record changes its ``record_hash`` and breaks every subsequent link, so
    :meth:`verify_integrity` detects it from the head hash alone (ADR 0009 / F-B4).
    """

    def __init__(self, store: LedgerStore | None = None) -> None:
        self._store: LedgerStore = store or InMemoryLedgerStore()

    # ---- writing -----------------------------------------------------------------
    def head_hash(self) -> str:
        entries = self._store.read_all()
        return entries[-1]["chain_hash"] if entries else GENESIS_HASH

    def append(self, record: TrialRecord) -> LedgerEntry:
        """Append a trial record, extending the hash chain."""
        require_aware(record.recorded_at, field="recorded_at")
        prev = self._store.read_all()
        seq = len(prev)
        prev_hash = prev[-1]["chain_hash"] if prev else GENESIS_HASH
        rec_dict = record.to_dict()
        rec_hash = content_hash(rec_dict)
        ch = chain_hash(prev_hash, rec_hash)
        self._store.append(
            {
                "seq": seq,
                "record": rec_dict,
                "record_hash": rec_hash,
                "prev_hash": prev_hash,
                "chain_hash": ch,
            }
        )
        return LedgerEntry(seq, record, rec_hash, prev_hash, ch)

    # ---- integrity ---------------------------------------------------------------
    def verify_integrity(self, *, checkpoint: tuple[int, str] | None = None) -> None:
        """Recompute the chain from genesis; raise on any break (tamper detection).

        Self-verification catches in-place edits (a changed record breaks every later link).
        It does **not**, on its own, catch *truncation* or a full *re-chain from genesis* — an
        attacker who drops the last N entries, or edits history and recomputes all hashes
        forward, produces a chain that self-verifies. To catch those you must pin the chain to
        an external witness: pass the last trusted ``checkpoint = (seq, chain_hash)`` obtained
        from an append-only/WORM store the writer cannot rewrite. The ledger must then be at
        least as long as the checkpoint and agree with it. (External anchoring of checkpoints
        is a Phase-7 entry-gate requirement — ADR 0009 §4.2 / ADR 0012.)
        """
        entries = self._store.read_all()
        prev_hash = GENESIS_HASH
        for i, entry in enumerate(entries):
            if entry.get("seq") != i:
                raise LedgerIntegrityError(f"non-monotonic seq at position {i}: {entry.get('seq')}")
            rec_hash = content_hash(entry["record"])
            if rec_hash != entry["record_hash"]:
                raise LedgerIntegrityError(f"record hash mismatch at seq {i} (record altered)")
            if entry["prev_hash"] != prev_hash:
                raise LedgerIntegrityError(f"broken prev-link at seq {i}")
            expected_chain = chain_hash(prev_hash, rec_hash)
            if entry["chain_hash"] != expected_chain:
                raise LedgerIntegrityError(f"broken chain hash at seq {i}")
            prev_hash = entry["chain_hash"]
        if checkpoint is not None:
            exp_seq, exp_chain = checkpoint
            if len(entries) <= exp_seq:
                raise LedgerIntegrityError(
                    f"ledger truncated: length {len(entries)} <= checkpointed seq {exp_seq}"
                )
            if entries[exp_seq]["chain_hash"] != exp_chain:
                raise LedgerIntegrityError(
                    f"ledger diverges from external checkpoint at seq {exp_seq} "
                    "(history re-chained or replaced)"
                )

    # ---- reading / queries -------------------------------------------------------
    def entries(self) -> list[LedgerEntry]:
        out: list[LedgerEntry] = []
        for e in self._store.read_all():
            out.append(
                LedgerEntry(
                    seq=e["seq"],
                    record=TrialRecord.from_dict(e["record"]),
                    record_hash=e["record_hash"],
                    prev_hash=e["prev_hash"],
                    chain_hash=e["chain_hash"],
                )
            )
        return out

    def latest_per_trial(self) -> dict[str, TrialRecord]:
        """The most recent record for each trial_id (its current state)."""
        latest: dict[str, TrialRecord] = {}
        for entry in self.entries():
            latest[entry.record.trial_id] = entry.record
        return latest

    def family_trial_count(self, family_id: str) -> int:
        """Distinct trials in a family — a **lower bound** on the multiplicity denominator.

        This counts recorded trials; it is only honest if the (Phase-3) runner writes one
        trial per parameter-grid point. It is a *lower bound* on the true testing surface
        because tests across multiple families on the same data also inflate the effective
        number of trials — use :meth:`total_trial_count` for the program-wide count (ADR 0005).
        """
        return len(
            {r.trial_id for r in self.latest_per_trial().values() if r.family_id == family_id}
        )

    def total_trial_count(self) -> int:
        """Program-wide distinct-trial count — the widest multiplicity denominator recorded."""
        return len(self.latest_per_trial())

    def head_checkpoint(self) -> tuple[int, str]:
        """The current ``(last_seq, head_chain_hash)`` — publish this to an external WORM
        store so a later :meth:`verify_integrity` can detect truncation/re-chain (ADR 0012)."""
        entries = self._store.read_all()
        if not entries:
            return (-1, GENESIS_HASH)
        return (entries[-1]["seq"], entries[-1]["chain_hash"])

    def summary(self) -> dict[str, Any]:
        """How many ideas were tested, which failed, which survived, which reached production."""
        latest = self.latest_per_trial()
        by_status: dict[str, int] = {}
        for r in latest.values():
            by_status[r.status.value] = by_status.get(r.status.value, 0) + 1
        families = {r.family_id for r in latest.values()}
        return {
            "total_trials": len(latest),
            "total_events": len(self.entries()),
            "families": len(families),
            "by_status": by_status,
            "failed": by_status.get(TrialStatus.FAILED.value, 0),
            "rejected": by_status.get(TrialStatus.REJECTED.value, 0),
            "completed": by_status.get(TrialStatus.COMPLETED.value, 0),
            "promoted": by_status.get(TrialStatus.PROMOTED.value, 0),
        }
