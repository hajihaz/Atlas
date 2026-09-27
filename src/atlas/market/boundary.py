"""Market-data boundary: explicit freshness and point-in-time admission."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass


@dataclass(frozen=True)
class MarketDataStatus:
    snapshot_id: str
    as_of: dt.datetime
    latest_observation: dt.datetime
    max_age: dt.timedelta

    @property
    def fresh(self) -> bool:
        if not self.snapshot_id or self.max_age < dt.timedelta(0):
            return False
        if self.as_of.tzinfo is None or self.latest_observation.tzinfo is None:
            return False
        as_of = self.as_of.astimezone(dt.UTC)
        latest = self.latest_observation.astimezone(dt.UTC)
        return latest <= as_of and as_of - latest <= self.max_age


class MarketDataBoundary:
    """Fail-closed admission check; it never fetches data or talks to brokers."""

    def admit(self, status: MarketDataStatus) -> None:
        if not status.snapshot_id:
            raise ValueError("market-data snapshot_id is required")
        if status.as_of.tzinfo is None or status.latest_observation.tzinfo is None:
            raise ValueError("market-data timestamps must be timezone-aware")
        if not status.fresh:
            raise ValueError("market-data snapshot is stale or from the future")
