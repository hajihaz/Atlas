"""Snapshot manifests.

A *snapshot* is an immutable materialization of an as-of query: "the world as known at
knowledge time K, for this universe/query spec". Its identity is its content — the manifest
records the content hash, so a backtest can pin a ``snapshot_id`` and be guaranteed
bit-identical inputs forever (ADR 0014). Re-materializing from the bitemporal store at the
same K must reproduce the same digest; :func:`verify_manifest` proves it.
"""

from __future__ import annotations

import datetime as _dt
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from atlas.common.errors import ReproducibilityError
from atlas.common.hashing import content_hash
from atlas.common.ids import snapshot_id as _snapshot_id
from atlas.common.time_utils import require_aware, to_utc


def _dataset_digest(rows: Sequence[Mapping[str, Any]]) -> str:
    """Order-independent content hash of a materialized dataset."""
    canonical = sorted(content_hash(dict(r)) for r in rows)
    return content_hash(canonical)


@dataclass(frozen=True)
class SnapshotManifest:
    """The reproducibility contract for one materialized dataset."""

    snapshot_id: str
    as_of: _dt.datetime  # knowledge time the world was frozen at
    universe_spec: Mapping[str, Any]
    content_digest: str
    row_count: int
    sources: tuple[str, ...]
    code_version: str | None = None
    dependency_lock_hash: str | None = None
    meta: Mapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "snapshot_id": self.snapshot_id,
            "as_of": to_utc(self.as_of).isoformat(),
            "universe_spec": dict(self.universe_spec),
            "content_digest": self.content_digest,
            "row_count": self.row_count,
            "sources": list(self.sources),
            "code_version": self.code_version,
            "dependency_lock_hash": self.dependency_lock_hash,
            "meta": dict(self.meta),
        }


def build_manifest(
    *,
    as_of: _dt.datetime,
    universe_spec: Mapping[str, Any],
    rows: Sequence[Mapping[str, Any]],
    sources: Sequence[str],
    code_version: str | None = None,
    dependency_lock_hash: str | None = None,
    meta: Mapping[str, Any] | None = None,
) -> SnapshotManifest:
    """Materialize a manifest from an as-of dataset."""
    as_of = to_utc(require_aware(as_of, field="as_of"))
    digest = _dataset_digest(rows)
    sid = _snapshot_id(
        as_of.isoformat(), dict(universe_spec), digest, code_version, dependency_lock_hash
    )
    return SnapshotManifest(
        snapshot_id=sid,
        as_of=as_of,
        universe_spec=dict(universe_spec),
        content_digest=digest,
        row_count=len(rows),
        sources=tuple(sorted(set(sources))),
        code_version=code_version,
        dependency_lock_hash=dependency_lock_hash,
        meta=dict(meta or {}),
    )


def verify_manifest(manifest: SnapshotManifest, rows: Sequence[Mapping[str, Any]]) -> None:
    """Raise :class:`ReproducibilityError` if *rows* do not reproduce the manifest."""
    digest = _dataset_digest(rows)
    if digest != manifest.content_digest:
        raise ReproducibilityError(
            f"snapshot {manifest.snapshot_id} does not reproduce: "
            f"expected digest {manifest.content_digest[:12]}…, got {digest[:12]}…"
        )
    if len(rows) != manifest.row_count:
        raise ReproducibilityError(
            f"snapshot {manifest.snapshot_id} row count mismatch: "
            f"expected {manifest.row_count}, got {len(rows)}"
        )
