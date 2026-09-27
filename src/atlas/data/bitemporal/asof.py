"""As-of resolution and append-only revision semantics.

This module is the *reference semantics* for point-in-time correctness. The SQL
persistence layer (``atlas.data.models``) must reproduce exactly what these pure
functions compute; the reproducibility tests assert that equivalence.
"""

from __future__ import annotations

import datetime as _dt
import itertools
from collections import defaultdict
from collections.abc import Iterable, Mapping
from typing import Any

from atlas.common.errors import PointInTimeViolation
from atlas.common.time_utils import FAR_FUTURE, require_aware, to_utc
from atlas.data.bitemporal.records import BitemporalVersion


def _normalize_as_of(as_of: _dt.datetime) -> _dt.datetime:
    as_of = to_utc(require_aware(as_of, field="as_of"))
    # The current version's interval is half-open [knowledge_from, FAR_FUTURE). Querying AT
    # or beyond the sentinel would fall outside it and silently return an empty world, so we
    # forbid it explicitly — "as of the latest" must be a real timestamp (e.g. now_utc()).
    if as_of >= FAR_FUTURE:
        raise PointInTimeViolation(
            f"as_of {as_of.isoformat()} is at/after the open-interval sentinel; "
            "pass a concrete knowledge time (e.g. now_utc()), not FAR_FUTURE"
        )
    return as_of


def resolve_asof(
    versions: Iterable[BitemporalVersion], as_of: _dt.datetime
) -> BitemporalVersion | None:
    """Return the single version of one logical fact effective at knowledge time *as_of*.

    Versions learned after *as_of* are invisible (no look-ahead). If the knowledge-time
    intervals overlap (a data-integrity bug — they must be disjoint per fact), this raises
    rather than guessing, because silently picking one would corrupt point-in-time truth.
    """
    as_of = _normalize_as_of(as_of)
    hits = [v for v in versions if v.knowledge_from <= as_of < v.knowledge_to]
    if not hits:
        return None
    if len(hits) > 1:
        keys = {v.key for v in hits}
        raise PointInTimeViolation(
            f"overlapping knowledge-time versions at {as_of.isoformat()} for {keys}: "
            "the append-only invariant is broken"
        )
    return hits[0]


def resolve_series(
    versions: Iterable[BitemporalVersion], as_of: _dt.datetime
) -> dict[str, BitemporalVersion]:
    """As-of resolve a mixed collection, returning the effective version per ``key``.

    Facts with no version known at *as_of* are simply absent from the result — exactly
    the survivorship-free behaviour we want (a stock not yet listed, a bar not yet known).
    """
    as_of = _normalize_as_of(as_of)
    by_key: dict[str, list[BitemporalVersion]] = defaultdict(list)
    for v in versions:
        by_key[v.key].append(v)
    out: dict[str, BitemporalVersion] = {}
    for key, group in by_key.items():
        effective = resolve_asof(group, as_of)
        if effective is not None:
            out[key] = effective
    return out


def verify_contiguity(versions: Iterable[BitemporalVersion]) -> None:
    """Assert each fact's knowledge-time versions form a gap-free, current-terminated chain.

    A *gap* between versions would make an as-of query inside it silently return "absent" —
    indistinguishable from "not yet known" — which is a survivorship-style false-absence.
    Raises :class:`PointInTimeViolation` on any gap, overlap, or a fact whose latest version
    does not extend to ``FAR_FUTURE`` (i.e. was closed with no successor).
    """
    by_key: dict[str, list[BitemporalVersion]] = defaultdict(list)
    for v in versions:
        by_key[v.key].append(v)
    for key, group in by_key.items():
        ordered = sorted(group, key=lambda v: v.knowledge_from)
        for a, b in itertools.pairwise(ordered):
            if a.knowledge_to != b.knowledge_from:
                raise PointInTimeViolation(
                    f"non-contiguous knowledge intervals for {key!r}: "
                    f"{a.knowledge_to.isoformat()} != {b.knowledge_from.isoformat()}"
                )
        if ordered and ordered[-1].knowledge_to < FAR_FUTURE:
            raise PointInTimeViolation(
                f"fact {key!r} was closed at {ordered[-1].knowledge_to.isoformat()} "
                "with no successor version (would resolve to a false absence)"
            )


def append_revision(
    current: BitemporalVersion | None,
    *,
    key: str,
    knowledge_time: _dt.datetime,
    payload: Mapping[str, Any],
    source: str,
    meta: Mapping[str, Any] | None = None,
) -> tuple[BitemporalVersion | None, BitemporalVersion]:
    """Append a correction/restatement as a *new* version, never an overwrite.

    Returns ``(closed_previous, new_version)``. If *current* is given it is "closed" by
    setting its ``knowledge_to`` to *knowledge_time* (returned as a new object — the input
    is not mutated); the new version opens at *knowledge_time* with ``revision + 1``.
    A correction cannot be back-dated before what it supersedes.
    """
    kt = to_utc(require_aware(knowledge_time, field="knowledge_time"))
    revision = 0
    closed_previous: BitemporalVersion | None = None
    if current is not None:
        if kt <= current.knowledge_from:
            raise PointInTimeViolation(
                "a correction's knowledge_time must be after the version it supersedes"
            )
        closed_previous = BitemporalVersion(
            key=current.key,
            knowledge_from=current.knowledge_from,
            knowledge_to=kt,
            payload=current.payload,
            source=current.source,
            revision=current.revision,
            meta=current.meta,
        )
        revision = current.revision + 1
    new_version = BitemporalVersion(
        key=key,
        knowledge_from=kt,
        knowledge_to=FAR_FUTURE,
        payload=dict(payload),
        source=source,
        revision=revision,
        meta=dict(meta or {}),
    )
    return closed_previous, new_version


class BitemporalStore:
    """A pure in-memory bitemporal store — reference semantics and a test double.

    Not the production store (that is PostgreSQL), but the *specification* the production
    store must satisfy. Append-only: ``record`` opens or corrects a fact; nothing is ever
    deleted or mutated.
    """

    def __init__(self) -> None:
        self._versions: dict[str, list[BitemporalVersion]] = defaultdict(list)

    def current(self, key: str) -> BitemporalVersion | None:
        for v in self._versions.get(key, ()):
            if v.is_current:
                return v
        return None

    def record(
        self,
        *,
        key: str,
        knowledge_time: _dt.datetime,
        payload: Mapping[str, Any],
        source: str,
        meta: Mapping[str, Any] | None = None,
    ) -> BitemporalVersion:
        """Record an observation or correction for *key* at *knowledge_time*."""
        closed, new = append_revision(
            self.current(key),
            key=key,
            knowledge_time=knowledge_time,
            payload=payload,
            source=source,
            meta=meta,
        )
        group = self._versions[key]
        if closed is not None:
            # Replace the (open) current version with its closed form; append the new one.
            for i, v in enumerate(group):
                if v.is_current:
                    group[i] = closed
                    break
        group.append(new)
        return new

    def as_of(self, key: str, as_of: _dt.datetime) -> BitemporalVersion | None:
        return resolve_asof(self._versions.get(key, ()), as_of)

    def as_of_all(self, as_of: _dt.datetime) -> dict[str, BitemporalVersion]:
        flat: list[BitemporalVersion] = [v for g in self._versions.values() for v in g]
        return resolve_series(flat, as_of)

    def all_versions(self, key: str) -> tuple[BitemporalVersion, ...]:
        return tuple(self._versions.get(key, ()))

    def verify_contiguity(self) -> None:
        """Assert every fact's version chain is gap-free and current-terminated."""
        verify_contiguity([v for g in self._versions.values() for v in g])

    def keys(self) -> tuple[str, ...]:
        return tuple(self._versions.keys())

    def audit_dump(self) -> list[dict[str, Any]]:
        """Full append-only history, for the audit trail / reproducibility."""
        rows: list[dict[str, Any]] = []
        for group in self._versions.values():
            for v in group:
                rows.append(
                    {
                        "key": v.key,
                        "knowledge_from": v.knowledge_from,
                        "knowledge_to": v.knowledge_to,
                        "revision": v.revision,
                        "source": v.source,
                        "payload": dict(v.payload),
                    }
                )
        rows.sort(key=lambda r: (r["key"], r["knowledge_from"]))
        return rows
