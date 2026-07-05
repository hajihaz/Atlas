"""Provenance stamping.

Every artifact Atlas produces (a normalized bar, a snapshot, a trial) carries provenance:
*which source, collected when, by which run, at which code version*. This is the raw
material for the four reproducibility questions (reproducibility.md): which data was used,
when it was collected, which source provided it, and whether the result can be reproduced.
"""

from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence

from atlas.common.time_utils import require_aware, to_utc


@dataclass(frozen=True)
class Provenance:
    """The origin record attached to a data artifact."""

    source: str
    collected_at: _dt.datetime           # knowledge time
    ingestion_run_id: str
    code_version: str | None = None
    dependency_lock_hash: str | None = None
    upstream: tuple[str, ...] = ()        # ids/hashes of parent artifacts
    meta: Mapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "collected_at": to_utc(self.collected_at).isoformat(),
            "ingestion_run_id": self.ingestion_run_id,
            "code_version": self.code_version,
            "dependency_lock_hash": self.dependency_lock_hash,
            "upstream": list(self.upstream),
            "meta": dict(self.meta),
        }


def stamp(
    *,
    source: str,
    collected_at: _dt.datetime,
    ingestion_run_id: str,
    code_version: str | None = None,
    dependency_lock_hash: str | None = None,
    upstream: Sequence[str] | None = None,
    meta: Mapping[str, Any] | None = None,
) -> Provenance:
    """Create a provenance record (rejects naive collected_at)."""
    return Provenance(
        source=source,
        collected_at=to_utc(require_aware(collected_at, field="collected_at")),
        ingestion_run_id=ingestion_run_id,
        code_version=code_version,
        dependency_lock_hash=dependency_lock_hash,
        upstream=tuple(upstream or ()),
        meta=dict(meta or {}),
    )
