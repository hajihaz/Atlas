"""NSE trading calendar.

A session exists on a weekday that is not an exchange holiday. The calendar is the
authority the data-quality layer consults to decide whether missing data is a *gap*
(missing session) or *correctly absent* (holiday/weekend) — see data-quality.md.

IMPORTANT — the embedded ``_SEED_HOLIDAYS`` is a **development seed**, NOT an authoritative
source. NSE publishes the official annual holiday list; production loads that list (with
its own provenance and knowledge time) into the ``trading_calendar`` table and constructs
the calendar from it. Tests use explicit, controlled holiday sets, never the seed, so the
*logic* is verified independently of the seed's completeness.
"""

from __future__ import annotations

import datetime as _dt
from collections.abc import Iterable
from dataclasses import dataclass, field

_SATURDAY, _SUNDAY = 5, 6

# Development seed — unambiguous NSE full-day holidays. Deliberately conservative and
# clearly non-authoritative. Replace with the official published list in production.
_SEED_HOLIDAYS: frozenset[_dt.date] = frozenset(
    {
        # 2024 (subset; national holidays that are unambiguous)
        _dt.date(2024, 1, 26),  # Republic Day
        _dt.date(2024, 3, 29),  # Good Friday
        _dt.date(2024, 8, 15),  # Independence Day
        _dt.date(2024, 10, 2),  # Gandhi Jayanti
        _dt.date(2024, 12, 25),  # Christmas
        # 2025 (subset)
        _dt.date(2025, 1, 26),
        _dt.date(2025, 8, 15),
        _dt.date(2025, 10, 2),
        _dt.date(2025, 12, 25),
    }
)


@dataclass(frozen=True)
class TradingCalendar:
    """A weekend-plus-holidays trading calendar.

    ``name`` identifies the exchange/segment; ``holidays`` is the set of full-day closures.
    ``covered_from``/``covered_to`` bound the range over which the holiday list is *known to
    be complete*; queries outside it are unreliable (a missing holiday would be silently
    treated as a session). When both are ``None`` the calendar is treated as unbounded
    (test calendars with an explicit, controlled holiday set). Construct with an explicit
    holiday set in tests and production; the module-level :data:`NSE` uses the dev seed.
    """

    name: str
    holidays: frozenset[_dt.date] = field(default_factory=frozenset)
    covered_from: _dt.date | None = None
    covered_to: _dt.date | None = None

    def covers_range(self, start: _dt.date, end: _dt.date) -> bool:
        """Whether the holiday list is known-complete over the whole ``[start, end]`` range."""
        if self.covered_from is None and self.covered_to is None:
            return True
        if self.covered_from is not None and start < self.covered_from:
            return False
        if self.covered_to is not None and end > self.covered_to:
            return False
        return True

    def is_weekend(self, day: _dt.date) -> bool:
        return day.weekday() in (_SATURDAY, _SUNDAY)

    def is_session(self, day: _dt.date) -> bool:
        """True if the exchange traded on *day* (weekday and not a holiday)."""
        return not self.is_weekend(day) and day not in self.holidays

    def sessions_in_range(self, start: _dt.date, end: _dt.date) -> list[_dt.date]:
        """All session dates in the inclusive ``[start, end]`` range, ascending."""
        if end < start:
            raise ValueError("end must be >= start")
        out: list[_dt.date] = []
        day = start
        one = _dt.timedelta(days=1)
        while day <= end:
            if self.is_session(day):
                out.append(day)
            day += one
        return out

    def expected_session_count(self, start: _dt.date, end: _dt.date) -> int:
        return len(self.sessions_in_range(start, end))

    def next_session(self, day: _dt.date) -> _dt.date:
        one = _dt.timedelta(days=1)
        cur = day + one
        while not self.is_session(cur):
            cur += one
        return cur

    def previous_session(self, day: _dt.date) -> _dt.date:
        one = _dt.timedelta(days=1)
        cur = day - one
        while not self.is_session(cur):
            cur -= one
        return cur

    def with_holidays(self, extra: Iterable[_dt.date]) -> TradingCalendar:
        """Return a new calendar with additional holidays (calendars are immutable)."""
        return TradingCalendar(
            self.name, self.holidays | frozenset(extra), self.covered_from, self.covered_to
        )


#: Development-seed NSE calendar. Production replaces the holiday set with the official list
#: and extends ``covered_to``. The seed's coverage is deliberately bounded to the years its
#: holiday list actually covers, so using it outside that range HALTS (CalendarCoverageCheck)
#: rather than silently mis-classifying sessions.
NSE = TradingCalendar(
    name="NSE",
    holidays=_SEED_HOLIDAYS,
    covered_from=_dt.date(2024, 1, 1),
    covered_to=_dt.date(2025, 12, 31),
)
