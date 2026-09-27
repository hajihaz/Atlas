"""Point-in-time-correct adjusted returns.

Returns are computed from a **fully back-adjusted close series** (each raw close scaled by
the cumulative factor of corporate actions with a later ex-date — Phase-2 adjust-on-read),
so a split/bonus/dividend produces the correct *economic* return, not a spurious gap.

Dividend reference closes are sourced **from the series itself** (the raw close on the
session before ex-date), not injected by the caller — closing the Phase-2 recommendation
that the dividend basis be as-of correct rather than caller-supplied.

Prices are converted to ``float`` once for return arithmetic. The engine's reproducibility
hash is taken over the resulting equity, which uses only IEEE-754 +-x/ (deterministic on a
platform); see ADR 0015.
"""

from __future__ import annotations

import datetime as _dt
import itertools
from collections.abc import Sequence
from decimal import Decimal

from atlas.data.adjustments.corporate_actions import CorporateAction, cumulative_price_factor
from atlas.data.market.records import OHLCVBar


def _ref_closes_from_series(
    series: Sequence[OHLCVBar], actions: Sequence[CorporateAction]
) -> dict[str, Decimal]:
    """For each dividend action, the raw close on the session strictly before its ex-date."""
    by_date = {b.event_date: b for b in series}
    dates = sorted(by_date)
    refs: dict[str, Decimal] = {}
    for ca in actions:
        prior = [d for d in dates if d < ca.ex_date]
        if prior:
            refs[ca.key()] = by_date[prior[-1]].close
    return refs


def adjusted_closes(
    series: Sequence[OHLCVBar], actions: Sequence[CorporateAction] = ()
) -> list[tuple[_dt.date, float]]:
    """Back-adjusted close series (ascending), suitable for return computation."""
    ordered = sorted(series, key=lambda b: b.event_date)
    refs = _ref_closes_from_series(ordered, actions)
    out: list[tuple[_dt.date, float]] = []
    for bar in ordered:
        factor = cumulative_price_factor(actions, bar.event_date, ref_closes=refs)
        out.append((bar.event_date, float(bar.close) * float(factor)))
    return out


def daily_returns(
    series: Sequence[OHLCVBar], actions: Sequence[CorporateAction] = ()
) -> dict[_dt.date, float]:
    """Close-to-close adjusted return for each session after the first: ``adj[t]/adj[t-1] - 1``."""
    adj = adjusted_closes(series, actions)
    out: dict[_dt.date, float] = {}
    for (_, prev), (day, cur) in itertools.pairwise(adj):
        out[day] = (cur / prev) - 1.0 if prev != 0 else 0.0
    return out
