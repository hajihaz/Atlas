"""Read-only quality diagnostics for Atlas's immutable NSE candle archive.

Intra-session gaps are *observed* between adjacent timestamps in the same
IST trading date. No exchange holiday calendar, full-universe completeness,
provider rights, or market executable quotations are inferred.
"""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass

from atlas.integrations.history_store import CandleArchive
from atlas.integrations.nse_sources import IST


@dataclass(frozen=True)
class IntradayGap:
    session_date: str
    previous_bar_ist: str
    next_bar_ist: str
    missing_bars: int


@dataclass(frozen=True)
class HistoricalQualityReport:
    provider: str
    instrument: str
    interval: str
    observed_bars: int
    observed_dates: int
    first_observed_ist: str
    last_observed_ist: str
    unique_source_payloads: int
    observed_missing_intraday_bars: int
    unusual_off_session_bars: int
    nonaligned_intervals: int
    gaps: tuple[IntradayGap, ...]
    status: str
    certified: bool = False
    authenticated_exchange_calendar: bool = False
    complete_point_in_time_universe: bool = False


def audit_history(
    archive: CandleArchive, *, provider: str, instrument: str, interval: str = "1m"
) -> HistoricalQualityReport:
    match = re.fullmatch(r"([1-9][0-9]?)m", interval)
    if not match or int(match.group(1)) > 60:
        raise ValueError("archive quality requires 1 to 60-minute candles")
    if provider not in {"upstox_v3", "fyers_v3"} or not instrument:
        raise ValueError("historical provider/instrument required")
    if not archive.path.is_file():
        raise ValueError("historical archive does not exist")
    rows = archive.rows(provider, instrument, interval)
    if not rows:
        raise ValueError("no candles for exact provider/instrument/interval")
    minutes = int(match.group(1))
    previous: dt.datetime | None = None
    gaps: list[IntradayGap] = []
    gaps_total = off_hours = nonaligned = 0
    sessions: set[dt.date] = set()
    hashes: set[str] = set()
    first: dt.datetime | None = None
    last: dt.datetime | None = None
    morning = dt.time(9, 15)
    closing = dt.time(15, 30)
    for row in rows:
        stamp = row[0]
        if not isinstance(stamp, dt.datetime) or stamp.tzinfo is None:
            raise ValueError("archive candle lacks timezone")
        instant = stamp.astimezone(IST)
        if previous is not None and instant <= previous:
            raise ValueError("duplicate or non-monotonic archive candle")
        sessions.add(instant.date())
        hashes.add(str(row[6]))
        if first is None:
            first = instant
        last = instant
        if instant.time() < morning or instant.time() > closing:
            off_hours += 1
        if previous is not None and previous.date() == instant.date():
            elapsed = (instant - previous).total_seconds()
            intended_seconds = minutes * 60
            if elapsed % intended_seconds != 0:
                nonaligned += 1
            if elapsed > intended_seconds:
                missed = max(0, int(elapsed // intended_seconds) - 1)
                gaps_total += missed
                if len(gaps) < 100:
                    gaps.append(
                        IntradayGap(
                            instant.date().isoformat(),
                            previous.isoformat(),
                            instant.isoformat(),
                            missed,
                        )
                    )
        previous = instant
    assert first is not None and last is not None
    anomalous = bool(gaps_total or off_hours or nonaligned)
    return HistoricalQualityReport(
        provider,
        instrument,
        interval,
        len(rows),
        len(sessions),
        first.isoformat(),
        last.isoformat(),
        len(hashes),
        gaps_total,
        off_hours,
        nonaligned,
        tuple(gaps),
        "UNCERTIFIED_OBSERVED_GAPS_OR_SESSION_ANOMALIES"
        if anomalous
        else "UNCERTIFIED_INCOMPLETE_EXCHANGE_COVERAGE_PROOF",
    )
