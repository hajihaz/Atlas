"""The bitemporal version record."""

from __future__ import annotations

import datetime as _dt
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from atlas.common.errors import PointInTimeViolation
from atlas.common.time_utils import FAR_FUTURE, require_aware, to_utc


@dataclass(frozen=True)
class BitemporalVersion:
    """One immutable version of a logical fact.

    ``key`` is the fact's stable logical identity (e.g. ``"ohlcv:inst_ab12:2024-03-15"``).
    A fact may have many versions over knowledge time; exactly one is "current"
    (``knowledge_to == FAR_FUTURE``). Corrections append a new version — the ``payload``
    is never mutated in place.

    ``revision`` is 0 for the original observation and increments on each correction.
    ``payload`` must be treated as read-only (it is JSON-serializable so it can be hashed).
    """

    key: str
    knowledge_from: _dt.datetime
    knowledge_to: _dt.datetime
    payload: Mapping[str, Any]
    source: str
    revision: int = 0
    meta: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        kf = to_utc(require_aware(self.knowledge_from, field="knowledge_from"))
        kt = to_utc(require_aware(self.knowledge_to, field="knowledge_to"))
        object.__setattr__(self, "knowledge_from", kf)
        object.__setattr__(self, "knowledge_to", kt)
        if kf >= kt:
            raise PointInTimeViolation(
                f"knowledge_from ({kf.isoformat()}) must precede "
                f"knowledge_to ({kt.isoformat()}) for key {self.key!r}"
            )
        if self.revision < 0:
            raise ValueError("revision must be >= 0")

    @property
    def is_current(self) -> bool:
        """True if this is the latest-known version (open transaction-time interval)."""
        return self.knowledge_to >= FAR_FUTURE

    def known_at(self, as_of: _dt.datetime) -> bool:
        """Whether this version was the effective one at knowledge time *as_of*."""
        as_of = to_utc(require_aware(as_of, field="as_of"))
        return self.knowledge_from <= as_of < self.knowledge_to
