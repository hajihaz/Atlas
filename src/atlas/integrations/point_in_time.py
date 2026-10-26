"""Top-volume NSE universe certification: refuse absent or future-known evidence."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class VolumeObservation:
    symbol: str
    cumulative_volume: int
    observed_at: dt.datetime
    known_at: dt.datetime


@dataclass(frozen=True)
class RankedUniverse:
    as_of: dt.datetime
    members: tuple[str, ...]
    top_ten: tuple[str, ...]
    digest: str
    status: str = "POINT_IN_TIME_RANKING_ONLY_NOT_EXECUTION_CERTIFIED"


def certify_volume_rank(
    *,
    as_of: dt.datetime,
    listed_members: Sequence[str],
    observations: Sequence[VolumeObservation],
    min_coverage: int = 10,
) -> RankedUniverse:
    if as_of.tzinfo is None or as_of.utcoffset() is None:
        raise ValueError("decision timestamp must be timezone-aware")
    members = tuple(sorted(listed_members))
    if len(members) < min_coverage or len(members) != len(set(members)):
        raise ValueError("incomplete or duplicated point-in-time NSE listing")
    by_symbol = {}
    for x in observations:
        if x.symbol not in members or x.symbol in by_symbol:
            raise ValueError("unknown or repeated symbol observation")
        if (
            x.observed_at.tzinfo is None
            or x.known_at.tzinfo is None
            or x.observed_at > as_of
            or x.known_at > as_of
            or x.known_at < x.observed_at
            or x.cumulative_volume < 0
        ):
            raise ValueError("future-known, malformed or negative volume evidence")
        by_symbol[x.symbol] = x
    if set(members) != set(by_symbol):
        raise ValueError("missing universe constituents; ranking uncertifiable")
    top = tuple(sorted(members, key=lambda x: (-by_symbol[x].cumulative_volume, x))[:10])
    canonical = {
        "as_of": as_of.isoformat(),
        "members": list(members),
        "top": list(top),
        "observations": [
            [
                s,
                by_symbol[s].cumulative_volume,
                by_symbol[s].observed_at.isoformat(),
                by_symbol[s].known_at.isoformat(),
            ]
            for s in members
        ],
    }
    digest = hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()
    return RankedUniverse(as_of, members, top, digest)
