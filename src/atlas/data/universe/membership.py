"""Index membership over two time axes.

A constituent query must be correct on **both** axes at once:

* **valid time** — was the stock actually *in* the index on the historical session date?
* **knowledge time** — did we *know* that as-of the analysis's knowledge time?

Getting this right is how Atlas eliminates survivorship bias: a backtest as-of a past
date sees exactly the index members then — including names later removed or delisted —
and never a member added afterwards. Membership facts are bitemporal versions, so a
restated effective date appends a new version rather than overwriting history.
"""

from __future__ import annotations

import datetime as _dt
from collections.abc import Iterable
from typing import Any

from atlas.common.time_utils import require_aware
from atlas.data.bitemporal.asof import BitemporalStore, resolve_series
from atlas.data.bitemporal.records import BitemporalVersion

#: Valid-time "still a member" sentinel (distinct from the knowledge-time FAR_FUTURE).
FAR_FUTURE_DATE = _dt.date(9999, 12, 31)


def _membership_key(index: str, instrument_id: str, valid_from: _dt.date) -> str:
    # valid_from is part of the key so a stock that LEAVES and later RE-JOINS an index
    # (two disjoint validity intervals) is representable as two distinct fact chains, while
    # a restatement of one interval's valid_to remains a correction to the same chain.
    return f"member:{index}:{instrument_id}:{valid_from.isoformat()}"


def constituents_from_versions(
    versions: Iterable[BitemporalVersion],
    *,
    index: str,
    event_date: _dt.date,
    known_as_of: _dt.datetime,
) -> set[str]:
    """Instrument ids in *index* on *event_date*, as known at *known_as_of*.

    Pure reference implementation: knowledge-time as-of first (what we knew), then
    valid-time containment (were they in on that date).
    """
    known_as_of = require_aware(known_as_of, field="known_as_of")
    prefix = f"member:{index}:"
    relevant = [v for v in versions if v.key.startswith(prefix)]
    effective = resolve_series(relevant, known_as_of)
    members: set[str] = set()
    for version in effective.values():
        payload = version.payload
        valid_from = _dt.date.fromisoformat(str(payload["valid_from"]))
        valid_to = _dt.date.fromisoformat(str(payload["valid_to"]))
        if valid_from <= event_date < valid_to:
            members.add(str(payload["instrument_id"]))
    return members


class UniverseLog:
    """Append-only, bitemporal record of index membership.

    Thin wrapper over a :class:`BitemporalStore` that speaks the membership domain.
    """

    def __init__(self, store: BitemporalStore | None = None) -> None:
        self._store = store or BitemporalStore()

    def add_membership(
        self,
        *,
        index: str,
        instrument_id: str,
        valid_from: _dt.date,
        knowledge_time: _dt.datetime,
        source: str,
        valid_to: _dt.date = FAR_FUTURE_DATE,
        meta: dict[str, Any] | None = None,
    ) -> BitemporalVersion:
        """Record index membership over ``[valid_from, valid_to)``."""
        payload = {
            "index": index,
            "instrument_id": instrument_id,
            "valid_from": valid_from.isoformat(),
            "valid_to": valid_to.isoformat(),
        }
        return self._store.record(
            key=_membership_key(index, instrument_id, valid_from),
            knowledge_time=knowledge_time,
            payload=payload,
            source=source,
            meta=meta,
        )

    def remove_membership(
        self,
        *,
        index: str,
        instrument_id: str,
        valid_from: _dt.date,
        valid_to: _dt.date,
        knowledge_time: _dt.datetime,
        source: str,
    ) -> BitemporalVersion:
        """Restate a member's effective interval to close at *valid_to* (a removal)."""
        return self.add_membership(
            index=index,
            instrument_id=instrument_id,
            valid_from=valid_from,
            valid_to=valid_to,
            knowledge_time=knowledge_time,
            source=source,
        )

    def constituents(
        self, *, index: str, event_date: _dt.date, known_as_of: _dt.datetime
    ) -> set[str]:
        flat = [v for k in self._store.keys() for v in self._store.all_versions(k)]
        return constituents_from_versions(
            flat, index=index, event_date=event_date, known_as_of=known_as_of
        )
