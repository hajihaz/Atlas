"""Strict closed-candle quality admission for offline research and paper readiness.

No network calls, credentials, fills or broker authority are available here.
Validating a candle is NOT permission to execute a paper or real order.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class ClosedResearchCandle:
    symbol: str
    provider: str
    opened_at: dt.datetime
    closed_at: dt.datetime
    received_at: dt.datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    trade_count: int


class ClosedCandleQualityGate:
    """Fail closed on non-causal, stale or fabricated source evidence."""

    def __init__(
        self, *, max_age: dt.timedelta = dt.timedelta(minutes=10),
        interval: dt.timedelta = dt.timedelta(minutes=1),
    ) -> None:
        if max_age <= dt.timedelta(0) or interval <= dt.timedelta(0):
            raise ValueError("positive interval and max_age required")
        self._max_age = max_age
        self._interval = interval

    def admit(
        self, candle: ClosedResearchCandle, *,
        previous: ClosedResearchCandle | None = None,
    ) -> None:
        if not candle.symbol or not candle.provider:
            raise ValueError("market-data provenance is required")
        stamps = (candle.opened_at, candle.closed_at, candle.received_at)
        if any(value.tzinfo is None or value.utcoffset() is None for value in stamps):
            raise ValueError("closed-candle timestamps must be timezone-aware")
        opened, closed, received = (stamp.astimezone(dt.UTC) for stamp in stamps)
        if closed - opened != self._interval:
            raise ValueError("invalid closed-candle interval")
        age = received - closed
        if age < dt.timedelta(0) or age > self._max_age:
            raise ValueError("candle is future-dated or stale")
        prices = (candle.open, candle.high, candle.low, candle.close)
        if any(not value.is_finite() or value <= 0 for value in prices):
            raise ValueError("invalid OHLC price")
        if candle.high < max(candle.open, candle.close):
            raise ValueError("high is below traded price")
        if candle.low > min(candle.open, candle.close) or candle.low > candle.high:
            raise ValueError("low is above traded price")
        if (not candle.volume.is_finite() or candle.volume < 0
                or not isinstance(candle.trade_count, int)
                or isinstance(candle.trade_count, bool) or candle.trade_count < 0):
            raise ValueError("invalid volume or trade count")
        if previous is not None:
            if (previous.symbol != candle.symbol or previous.provider != candle.provider):
                raise ValueError("candle provenance changed within sequence")
            prior = previous.closed_at
            if prior.tzinfo is None or prior.utcoffset() is None:
                raise ValueError("previous timestamp must be timezone-aware")
            if prior.astimezone(dt.UTC) != opened:
                raise ValueError("missing, duplicate or out-of-order candle interval")
