"""The leak-proof, as-of research DataView (ADR 0017).

This is the structural defense against look-ahead and feature leakage — the biggest gap
flagged at the end of Phase 2. A strategy is handed a :class:`DataView` pinned to a
*decision date* and can access **only bars strictly before that date**. There is no method
that returns a current-or-future bar, so a feature computed from the view cannot peek past
the decision — leakage is impossible by construction, not by discipline (ADR 0005).

The underlying :class:`BarSource` is assumed already materialized as-of a single knowledge
time (a Phase-2 snapshot), so knowledge-time correctness is handled upstream; the DataView
enforces the *event-time* boundary.
"""

from __future__ import annotations

import datetime as _dt
from bisect import bisect_left
from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Protocol

from atlas.common.errors import PointInTimeViolation
from atlas.data.market.records import OHLCVBar


class BarSource(Protocol):
    """A source of per-instrument OHLCV series, ascending by event date."""

    def instruments(self) -> list[str]: ...

    def series(self, instrument_id: str) -> list[OHLCVBar]: ...


class InMemoryBarSource:
    """An in-memory bar source (tests, synthetic data, and materialized snapshots).

    Production wraps the Phase-2 bitemporal store / a snapshot behind this same protocol.
    """

    def __init__(self, bars_by_instrument: Mapping[str, Sequence[OHLCVBar]]) -> None:
        self._by_instrument: dict[str, list[OHLCVBar]] = {
            iid: sorted(bars, key=lambda b: b.event_date)
            for iid, bars in bars_by_instrument.items()
        }
        # Precompute the event-date index per instrument for fast as-of slicing.
        self._dates: dict[str, list[_dt.date]] = {
            iid: [b.event_date for b in bars] for iid, bars in self._by_instrument.items()
        }

    def instruments(self) -> list[str]:
        return sorted(self._by_instrument)

    def series(self, instrument_id: str) -> list[OHLCVBar]:
        return list(self._by_instrument.get(instrument_id, ()))

    def _dates_for(self, instrument_id: str) -> list[_dt.date]:
        return self._dates.get(instrument_id, [])


class DataView:
    """A view of the market as knowable at ``decision_date`` — exposing only prior bars.

    Every accessor returns data with ``event_date < decision_date``. Requesting anything on
    or after the decision date raises :class:`PointInTimeViolation`.
    """

    def __init__(self, source: BarSource, decision_date: _dt.date) -> None:
        self._source = source
        self.decision_date = decision_date

    def instruments(self) -> list[str]:
        return self._source.instruments()

    def _prior_slice(self, instrument_id: str) -> list[OHLCVBar]:
        series = self._source.series(instrument_id)
        # Strictly-before-decision-date slice (no same-day look-ahead).
        if isinstance(self._source, InMemoryBarSource):
            dates = self._source._dates_for(instrument_id)
            cut = bisect_left(dates, self.decision_date)
            return series[:cut]
        return [b for b in series if b.event_date < self.decision_date]

    def history(self, instrument_id: str, lookback: int | None = None) -> list[OHLCVBar]:
        """Bars strictly before the decision date, optionally the last ``lookback`` of them."""
        prior = self._prior_slice(instrument_id)
        return prior[-lookback:] if lookback is not None else prior

    def closes(self, instrument_id: str, lookback: int | None = None) -> list[Decimal]:
        return [b.close for b in self.history(instrument_id, lookback)]

    def last_close(self, instrument_id: str) -> Decimal | None:
        prior = self._prior_slice(instrument_id)
        return prior[-1].close if prior else None

    def bar_on(self, instrument_id: str, event_date: _dt.date) -> OHLCVBar | None:
        """A specific historical bar — raises if the date is not strictly in the past."""
        if event_date >= self.decision_date:
            raise PointInTimeViolation(
                f"look-ahead: bar_on({event_date}) requested at decision {self.decision_date}"
            )
        for b in self._prior_slice(instrument_id):
            if b.event_date == event_date:
                return b
        return None
