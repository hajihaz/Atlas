"""Bitemporal point-in-time storage semantics (ADR 0011).

Two time axes:

* **valid time** — the instant a fact is *about* (a session date, a membership interval);
* **knowledge time** — when Atlas *learned* it (append-only transaction time).

The universal primitive here is *knowledge-time as-of resolution*: given an ``as_of``
knowledge time, return the version each fact had **as it was known then**. Any version
learned after ``as_of`` is invisible, so look-ahead bias is structurally impossible.
Corrections never overwrite — they append a new version and close the old one.
"""

from __future__ import annotations

from atlas.data.bitemporal.asof import (
    BitemporalStore,
    append_revision,
    resolve_asof,
    resolve_series,
    verify_contiguity,
)
from atlas.data.bitemporal.records import BitemporalVersion

__all__ = [
    "BitemporalVersion",
    "BitemporalStore",
    "resolve_asof",
    "resolve_series",
    "append_revision",
    "verify_contiguity",
]
