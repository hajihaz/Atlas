"""Time Authority — the single source of time discipline for Atlas.

Two rules make point-in-time correctness enforceable rather than aspirational:

1. **Every datetime is timezone-aware.** A naive datetime is a bug, not a convenience —
   it silently corrupts the event-time / knowledge-time distinction. :func:`require_aware`
   rejects them at every boundary.
2. **Knowledge time is UTC; event dates are IST sessions.** NSE trades in Asia/Kolkata
   (IST, no DST). Event/session semantics use IST; all *knowledge-time* comparisons are
   done in UTC so ordering is unambiguous.

The open end of a bitemporal interval ("still current") is represented by the explicit
sentinel :data:`FAR_FUTURE` rather than NULL/infinity, for portable, comparable SQL and
tests (ADR 0011).
"""

from __future__ import annotations

import datetime as _dt
from zoneinfo import ZoneInfo

from atlas.common.errors import PointInTimeViolation

UTC = _dt.timezone.utc
IST = ZoneInfo("Asia/Kolkata")

#: Bitemporal "open interval" upper bound — a record valid "until further notice".
FAR_FUTURE: _dt.datetime = _dt.datetime(9999, 12, 31, 0, 0, 0, tzinfo=UTC)

#: NSE regular equity session (IST). Used to derive canonical session-close knowledge times.
NSE_SESSION_OPEN = _dt.time(9, 15)
NSE_SESSION_CLOSE = _dt.time(15, 30)


def require_aware(value: _dt.datetime, *, field: str = "datetime") -> _dt.datetime:
    """Return *value* unchanged, or raise if it is timezone-naive.

    Naive datetimes are the root cause of an entire class of look-ahead bugs, so Atlas
    refuses them everywhere.
    """
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        raise PointInTimeViolation(f"{field} must be timezone-aware; got naive {value!r}")
    return value


def to_utc(value: _dt.datetime) -> _dt.datetime:
    """Normalize an aware datetime to UTC (raises on naive input)."""
    return require_aware(value).astimezone(UTC)


def now_utc() -> _dt.datetime:
    """The **only** sanctioned wall-clock read in Atlas.

    Core/domain functions never call this — an ``as_of`` knowledge time is always passed
    in explicitly, which is what makes them deterministic and testable. Ingestion uses it
    once, to stamp the knowledge time of newly collected observations.
    """
    return _dt.datetime.now(tz=UTC)


def session_close_utc(session_date: _dt.date) -> _dt.datetime:
    """Knowledge time corresponding to the close of the IST session on *session_date*.

    A convenient canonical "as-of" for end-of-day data: the moment a day's official
    close became knowable.
    """
    # Build the aware datetime directly (combine(..., tzinfo=) resolves correctly), rather
    # than .replace(tzinfo=…) which is the documented foot-gun for zones with transitions.
    return _dt.datetime.combine(session_date, NSE_SESSION_CLOSE, tzinfo=IST).astimezone(UTC)


def is_far_future(value: _dt.datetime) -> bool:
    """True if *value* is the open-interval sentinel."""
    return to_utc(value) >= FAR_FUTURE


def ist_date(value: _dt.datetime) -> _dt.date:
    """The IST calendar date of an aware datetime (the session it belongs to)."""
    return to_utc(value).astimezone(IST).date()
