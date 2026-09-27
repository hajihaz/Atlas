"""Deterministic synthetic market data — for tests, demos, and validation experiments.

NOT market data. These generators produce seeded, reproducible price series with a *known*
structure (pure noise, or noise + an embedded trend) so the engine and overfitting defenses
can be validated against ground truth: a strategy on noise must be rejected; a strategy on a
genuine signal should survive. Kept in the package (not tests) so demos and the CLI can use it.
"""

from __future__ import annotations

import datetime as _dt
import random
from collections.abc import Sequence
from decimal import Decimal

from atlas.data.calendars.nse_calendar import TradingCalendar
from atlas.data.market.records import OHLCVBar


def _bar(instrument_id: str, day: _dt.date, close: float) -> OHLCVBar:
    c = Decimal(str(round(close, 4)))
    return OHLCVBar(instrument_id, day, c, c, c, c, 1000, "synthetic")


def random_walk(
    instrument_id: str,
    dates: Sequence[_dt.date],
    *,
    seed: int,
    start: float = 100.0,
    vol: float = 0.01,
    drift: float = 0.0,
) -> list[OHLCVBar]:
    """A geometric random walk with optional drift. ``drift=0`` is pure noise (no signal)."""
    rng = random.Random(seed)  # noqa: S311 - deterministic simulation, not security
    price = start
    bars: list[OHLCVBar] = []
    for day in dates:
        price *= 1.0 + drift + rng.gauss(0.0, vol)
        price = max(price, 0.01)
        bars.append(_bar(instrument_id, day, price))
    return bars


def sessions(calendar: TradingCalendar, start: _dt.date, end: _dt.date) -> list[_dt.date]:
    return calendar.sessions_in_range(start, end)


def unbounded_calendar(name: str = "SYNTH") -> TradingCalendar:
    """A weekends-only calendar (no holidays), covering all dates — for synthetic sessions."""
    return TradingCalendar(name, frozenset())
