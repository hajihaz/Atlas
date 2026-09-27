"""Concrete data-quality checks.

Severity encodes the fail-safe response: **ERROR/CRITICAL halt** downstream use (the data
cannot be trusted for capital); **WARNING** flags anomalies to investigate; **INFO** records
an explained event. Each check is pure and independently testable.

Coverage (data-quality.md): missing data, duplicates, bad prices, corporate-action issues,
universe drift, timestamp problems, and cross-source disagreement.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Iterable
from datetime import date
from decimal import Decimal

from atlas.common.types import Severity
from atlas.data.quality.framework import Check, DataBatch, Finding, ValidationSuite


class OHLCVIntegrityCheck(Check):
    """Bad prices: OHLC ordering invariants, positivity, non-negative volume."""

    name = "ohlcv_integrity"

    def run(self, batch: DataBatch) -> list[Finding]:
        out: list[Finding] = []
        for bar in batch.bars:
            problems = []
            if not (bar.low <= bar.open <= bar.high):
                problems.append("open outside [low, high]")
            if not (bar.low <= bar.close <= bar.high):
                problems.append("close outside [low, high]")
            if bar.high < bar.low:
                problems.append("high < low")
            if min(bar.open, bar.high, bar.low, bar.close) <= 0:
                problems.append("non-positive price")
            if bar.volume < 0:
                problems.append("negative volume")
            if problems:
                out.append(
                    Finding(
                        self.name,
                        Severity.ERROR,
                        "bad OHLCV bar: " + "; ".join(problems),
                        entity_key=bar.key(),
                    )
                )
        return out


class DuplicateBarCheck(Check):
    """Duplicate data: the same (instrument, session) appearing more than once."""

    name = "duplicate_bars"

    def run(self, batch: DataBatch) -> list[Finding]:
        counts = Counter(bar.key() for bar in batch.bars)
        return [
            Finding(self.name, Severity.ERROR, f"duplicate bar x{n}", entity_key=key)
            for key, n in counts.items()
            if n > 1
        ]


class FutureDateCheck(Check):
    """Timestamp problems: a bar dated after the knowledge date is impossible (look-ahead)."""

    name = "future_date"

    def run(self, batch: DataBatch) -> list[Finding]:
        if batch.as_of_date is None:
            return []
        return [
            Finding(
                self.name,
                Severity.CRITICAL,
                f"bar dated {bar.event_date} is after as-of {batch.as_of_date} (look-ahead)",
                entity_key=bar.key(),
            )
            for bar in batch.bars
            if bar.event_date > batch.as_of_date
        ]


class NonSessionDateCheck(Check):
    """Timestamp problems: a bar on a weekend/holiday (non-trading day)."""

    name = "non_session_date"

    def run(self, batch: DataBatch) -> list[Finding]:
        if batch.calendar is None:
            return []
        return [
            Finding(
                self.name,
                Severity.ERROR,
                f"bar on non-session date {bar.event_date}",
                entity_key=bar.key(),
            )
            for bar in batch.bars
            if not batch.calendar.is_session(bar.event_date)
        ]


class MissingSessionCheck(Check):
    """Missing data: sessions in range for which an instrument has no bar."""

    name = "missing_session"

    def run(self, batch: DataBatch) -> list[Finding]:
        if batch.calendar is None or batch.date_range is None:
            return []
        start, end = batch.date_range
        expected = set(batch.calendar.sessions_in_range(start, end))
        present: dict[str, set[date]] = defaultdict(set)
        for bar in batch.bars:
            present[bar.instrument_id].add(bar.event_date)
        out: list[Finding] = []
        for instrument_id, dates in present.items():
            missing = sorted(d for d in expected - dates)
            if missing:
                out.append(
                    Finding(
                        self.name,
                        Severity.ERROR,
                        f"{len(missing)} missing session(s), first {missing[0]}",
                        entity_key=instrument_id,
                        context={"missing": [d.isoformat() for d in missing[:10]]},
                    )
                )
        return out


class PriceJumpCheck(Check):
    """Corporate-action issues / bad prices: a large jump vs. the prior close that is NOT
    explained by a known corporate action on that date is suspicious (missing CA or bad
    price). An explained jump is recorded as INFO.

    Contract: ``batch.ex_dates`` must contain **only price-affecting** corporate-action
    ex-dates (split/bonus/dividend/rights), filtered to what was knowable as-of the batch's
    knowledge time — a non-price action (symbol change) must not excuse a jump. Magnitude
    reconciliation (does the move match the split ratio?) is a planned future check.
    """

    name = "price_jump"

    def __init__(self, threshold: Decimal = Decimal("0.20")) -> None:
        self.threshold = threshold

    def run(self, batch: DataBatch) -> list[Finding]:
        out: list[Finding] = []
        for bar in batch.bars:
            prior = batch.prior_close.get(bar.instrument_id)
            if prior is None or prior <= 0:
                continue
            move = abs(bar.close - prior) / prior
            if move <= self.threshold:
                continue
            explained = bar.event_date in batch.ex_dates.get(bar.instrument_id, set())
            if explained:
                out.append(
                    Finding(
                        self.name,
                        Severity.INFO,
                        f"{move:.1%} move explained by corporate action on {bar.event_date}",
                        entity_key=bar.key(),
                    )
                )
            else:
                out.append(
                    Finding(
                        self.name,
                        Severity.ERROR,
                        f"unexplained {move:.1%} price jump (bad price or missing corp action)",
                        entity_key=bar.key(),
                    )
                )
        return out


class StalePriceCheck(Check):
    """Bad prices: a frozen price (unchanged close) with zero volume looks stale/dead."""

    name = "stale_price"

    def run(self, batch: DataBatch) -> list[Finding]:
        out: list[Finding] = []
        for bar in batch.bars:
            prior = batch.prior_close.get(bar.instrument_id)
            if prior is not None and bar.close == prior and bar.volume == 0:
                out.append(
                    Finding(
                        self.name,
                        Severity.WARNING,
                        "unchanged close with zero volume (possibly stale)",
                        entity_key=bar.key(),
                    )
                )
        return out


class CrossSourceDisagreementCheck(Check):
    """Data-source disagreement: capital-affecting data must be corroborated across >=2
    independent sources (ADR 0009). A close differing beyond tolerance from a second source
    is halting — poisoned/in-range-but-wrong data must not drive downstream use.
    """

    name = "cross_source_disagreement"

    def __init__(self, tolerance: Decimal = Decimal("0.005")) -> None:  # 50 bps
        self.tolerance = tolerance

    def run(self, batch: DataBatch) -> list[Finding]:
        out: list[Finding] = []
        for bar in batch.bars:
            other = batch.cross_source_close.get((bar.instrument_id, bar.event_date))
            if other is None or bar.close <= 0:
                continue
            diff = abs(bar.close - other) / bar.close
            if diff > self.tolerance:
                out.append(
                    Finding(
                        self.name,
                        Severity.ERROR,
                        f"sources disagree by {diff:.2%} (>{self.tolerance:.2%})",
                        entity_key=bar.key(),
                        context={"primary": str(bar.close), "secondary": str(other)},
                    )
                )
        return out


class UniverseSizeCheck(Check):
    """Universe drift: an index whose observed constituent count deviates from expected."""

    name = "universe_size"

    def run(self, batch: DataBatch) -> list[Finding]:
        out: list[Finding] = []
        for index, (observed, expected) in batch.index_observed.items():
            if observed != expected:
                out.append(
                    Finding(
                        self.name,
                        Severity.ERROR,
                        f"{index}: {observed} constituents, expected {expected} (universe drift)",
                        entity_key=index,
                    )
                )
        return out


class CalendarCoverageCheck(Check):
    """Fail-safe: if the validation range extends beyond the calendar's known coverage, the
    calendar cannot reliably say what is a session — so we HALT rather than silently trust
    ``weekday == session``. This defends against using a stale/dev-seed holiday list on dates
    it does not cover (which would otherwise both false-flag gaps AND pass holiday bars).
    """

    name = "calendar_coverage"

    def run(self, batch: DataBatch) -> list[Finding]:
        if batch.calendar is None or batch.date_range is None:
            return []
        start, end = batch.date_range
        if not batch.calendar.covers_range(start, end):
            return [
                Finding(
                    self.name,
                    Severity.ERROR,
                    f"calendar '{batch.calendar.name}' does not cover [{start}, {end}] — "
                    "session/holiday classification is unreliable",
                    entity_key=batch.calendar.name,
                )
            ]
        return []


class FreshnessCheck(Check):
    """Fail-safe fresh-data gate (charter §4.2 / F-E1): halt if the newest bar lags the
    knowledge date by more than ``max_stale_days`` — a frozen/hung vendor feed must stop
    downstream use, not silently serve yesterday's world as today's.
    """

    name = "freshness"

    def run(self, batch: DataBatch) -> list[Finding]:
        if batch.as_of_date is None or not batch.bars:
            return []
        newest = max(b.event_date for b in batch.bars)
        lag = (batch.as_of_date - newest).days
        if lag > batch.max_stale_days:
            return [
                Finding(
                    self.name,
                    Severity.ERROR,
                    f"stale feed: newest bar {newest} lags as-of {batch.as_of_date} by "
                    f"{lag}d (> {batch.max_stale_days}d)",
                )
            ]
        return []


class ExpectedInstrumentCheck(Check):
    """Fail-safe: an instrument that was requested but returned NO bars has been silently
    dropped by the vendor. Reconciling requested-vs-received catches a truncated universe
    that per-instrument checks (which only see instruments present) cannot.
    """

    name = "expected_instrument"

    def run(self, batch: DataBatch) -> list[Finding]:
        if not batch.expected_instruments:
            return []
        present = {b.instrument_id for b in batch.bars}
        missing = sorted(batch.expected_instruments - present)
        return [
            Finding(
                self.name, Severity.ERROR, "requested instrument returned no data", entity_key=iid
            )
            for iid in missing
        ]


def default_checks() -> list[Check]:
    return [
        OHLCVIntegrityCheck(),
        DuplicateBarCheck(),
        FutureDateCheck(),
        NonSessionDateCheck(),
        CalendarCoverageCheck(),
        MissingSessionCheck(),
        FreshnessCheck(),
        ExpectedInstrumentCheck(),
        PriceJumpCheck(),
        StalePriceCheck(),
        CrossSourceDisagreementCheck(),
        UniverseSizeCheck(),
    ]


def default_suite(extra: Iterable[Check] | None = None) -> ValidationSuite:
    """The standard Atlas validation suite."""
    return ValidationSuite([*default_checks(), *(extra or [])])
