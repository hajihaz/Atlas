"""Atlas x Day Trader Skill: deterministic NSE-CM research-only adapter.

Independently implemented from the concepts in Jakeschincariol/day-trader-skill
(MIT, pinned commit 3d0f4ef). Not a live market feed, broker, order router,
portfolio recommendation, or production strategy. All input currently MUST be
tagged synthetic_fixture and span a complete NSE cash session.

Timing is intentionally conservative:
- Observe 09:15-09:30 opening range (three fully closed 5-minute candles).
- Evaluate 09:30-09:35 *closed* signal candle using data available by 09:40.
- Earliest hypothetical fill: 09:40 candle OPEN, never same-bar high/low.
- Every later exit checks candle high/low; simultaneous stop+target = STOP.
- Remaining position marked at 15:25-15:30 closing candle CLOSE.
- Full-session completeness, observed-at, IST and explicit calendar coverage
  are checked before any output; no lookahead or missing-bar substitution.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
import random
from dataclasses import dataclass, field
from decimal import ROUND_FLOOR, Decimal
from typing import Literal, TypedDict
from zoneinfo import ZoneInfo

from atlas.data.calendars.nse_calendar import TradingCalendar

IST = ZoneInfo("Asia/Kolkata")
D = Decimal
FIVE = dt.timedelta(minutes=5)
START = dt.time(9, 15)
LAST = dt.time(15, 25)
SIGNAL = dt.time(9, 30)
FILL = dt.time(9, 40)
SOURCE: Literal["synthetic_fixture"] = "synthetic_fixture"
UPSTREAM = "Jakeschincariol/day-trader-skill@3d0f4ef"


class ResearchDataNotReady(ValueError):
    """Reject input that cannot support causal offline research."""


@dataclass(frozen=True)
class Candle5m:
    symbol: str
    opened_at: dt.datetime
    observed_at: dt.datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int
    source_kind: Literal["synthetic_fixture"] = SOURCE

    def __post_init__(self) -> None:
        if not self.symbol or self.symbol != self.symbol.upper() or self.source_kind != SOURCE:
            raise ResearchDataNotReady("only labeled synthetic NSE fixture symbols are accepted")
        for stamp in (self.opened_at, self.observed_at):
            if stamp.tzinfo is None or stamp.utcoffset() != dt.timedelta(hours=5, minutes=30):
                raise ResearchDataNotReady("both timestamps must be aware IST (+05:30)")
            if stamp.astimezone(IST).date() != self.opened_at.date():
                raise ResearchDataNotReady("cross-session timestamps are prohibited")
        if self.opened_at.second or self.opened_at.microsecond or self.opened_at.minute % 5:
            raise ResearchDataNotReady("only aligned five-minute candles accepted")
        if self.observed_at < self.opened_at + FIVE:
            raise ResearchDataNotReady("partial/future candle cannot be observed")
        prices = (self.open, self.high, self.low, self.close)
        if any(not isinstance(p, Decimal) or not p.is_finite() or p <= 0 for p in prices):
            raise ResearchDataNotReady("prices must be finite positive Decimals")
        if self.low > min(self.open, self.close) or self.high < max(self.open, self.close):
            raise ResearchDataNotReady("OHLC structure invalid")
        if isinstance(self.volume, bool) or not isinstance(self.volume, int) or self.volume < 0:
            raise ResearchDataNotReady("volume must be a nonnegative integer")


@dataclass(frozen=True)
class ResearchRules:
    starting_capital: Decimal = field(default_factory=lambda: D("100000"))
    max_position_notional: Decimal = field(default_factory=lambda: D("10000"))
    risk_fraction: Decimal = field(default_factory=lambda: D("0.001"))
    stop_fraction: Decimal = field(default_factory=lambda: D("0.01"))
    reward_multiple: Decimal = field(default_factory=lambda: D("2"))
    cost_bps_each_side: Decimal = field(default_factory=lambda: D("5"))

    def __post_init__(self) -> None:
        nums = (
            self.starting_capital,
            self.max_position_notional,
            self.risk_fraction,
            self.stop_fraction,
            self.reward_multiple,
            self.cost_bps_each_side,
        )
        if any(not isinstance(v, Decimal) or not v.is_finite() for v in nums):
            raise ValueError("all research rule values must be finite Decimals")
        if (
            self.starting_capital <= 0
            or self.max_position_notional <= 0
            or self.max_position_notional > self.starting_capital
            or not D("0") < self.risk_fraction <= D("0.05")
            or not D("0") < self.stop_fraction <= D("0.1")
            or not D("0") < self.reward_multiple <= D("10")
            or not D("0") <= self.cost_bps_each_side <= D("100")
        ):
            raise ValueError("unsafe position, cost or stop/target research settings")


@dataclass(frozen=True)
class ResearchOutcome:
    session: str
    symbol: str
    data_class: str
    signal_at: str
    fill_at: str | None
    exit_at: str | None
    reason: str
    shares: int
    entry: Decimal | None
    exit: Decimal | None
    stop: Decimal | None
    target: Decimal | None
    net_pnl: Decimal
    decision_hash: str
    source_hash: str
    orders_submitted: int = 0


class _OutcomeIdentity(TypedDict):
    session: str
    symbol: str
    data_class: str
    signal_at: str
    decision_hash: str
    source_hash: str


def _digest(value: object) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _session_times(day: dt.date) -> tuple[dt.datetime, ...]:
    at = dt.datetime.combine(day, START, tzinfo=IST)
    end = dt.datetime.combine(day, LAST, tzinfo=IST)
    result = []
    while at <= end:
        result.append(at)
        at += FIVE
    return tuple(result)


def validate_session(
    bars: tuple[Candle5m, ...], *, calendar: TradingCalendar
) -> tuple[Candle5m, ...]:
    """Require an exact complete 75-bar, time-causal, licensed-*synthetic* snapshot."""
    if len(bars) != 75:
        raise ResearchDataNotReady("complete 75 five-minute NSE-CM candles required")
    ordered = tuple(sorted(bars, key=lambda b: b.opened_at))
    first = ordered[0]
    day = first.opened_at.date()
    if (
        calendar.name.upper().split("-")[0] != "NSE"
        or calendar.covered_from is None
        or calendar.covered_to is None
        or not calendar.covers_range(day, day)
        or not calendar.is_session(day)
    ):
        raise ResearchDataNotReady("explicit covered NSE cash session calendar required")
    expected = _session_times(day)
    if len(expected) != len(ordered):
        raise ResearchDataNotReady("NSE cash session timing mismatch")
    symbol = first.symbol
    for bar, stamp in zip(ordered, expected, strict=True):
        if bar.symbol != symbol or bar.opened_at != stamp:
            raise ResearchDataNotReady("missing/duplicate/outside-session/mixed-symbol candle")
        if bar.observed_at > stamp + FIVE + dt.timedelta(minutes=4):
            raise ResearchDataNotReady("closed candle received too late for causal replay")
    return ordered


def replay_session(
    bars: tuple[Candle5m, ...],
    *,
    calendar: TradingCalendar,
    rules: ResearchRules | None = None,
) -> ResearchOutcome:
    """One long-only conservative ORB study. No order objects or broker interfaces."""
    rules = rules or ResearchRules()
    ordered = validate_session(bars, calendar=calendar)
    by_time = {x.opened_at.time(): x for x in ordered}
    opening = [by_time[dt.time(9, m)] for m in (15, 20, 25)]
    signal = by_time[SIGNAL]
    fill = by_time[FILL]
    # Closed signal candle at 09:35 is used for 09:40 fill.
    if any(bar.observed_at > fill.opened_at for bar in (*opening, signal)):
        raise ResearchDataNotReady("signal not available before proposed fill; no lookahead")
    high = max(x.high for x in opening)
    decision = {
        "source": SOURCE,
        "symbol": signal.symbol,
        "day": signal.opened_at.date().isoformat(),
        "range_high": str(high),
        "signal_close": str(signal.close),
        "signal_observed_at": signal.observed_at.isoformat(),
        "earliest_fill": fill.opened_at.isoformat(),
        "rules": tuple(
            str(x)
            for x in (
                rules.max_position_notional,
                rules.risk_fraction,
                rules.stop_fraction,
                rules.reward_multiple,
            )
        ),
    }
    decision_hash = _digest(decision)
    source_hash = _digest(
        [
            (
                b.opened_at.isoformat(),
                b.observed_at.isoformat(),
                str(b.open),
                str(b.high),
                str(b.low),
                str(b.close),
                b.volume,
            )
            for b in ordered
        ]
    )
    common: _OutcomeIdentity = {
        "session": signal.opened_at.date().isoformat(),
        "symbol": signal.symbol,
        "data_class": SOURCE,
        "signal_at": signal.opened_at.isoformat(),
        "decision_hash": decision_hash,
        "source_hash": source_hash,
    }
    if signal.close <= high:
        return ResearchOutcome(
            **common,
            fill_at=None,
            exit_at=None,
            reason="no_closed_breakout",
            shares=0,
            entry=None,
            exit=None,
            stop=None,
            target=None,
            net_pnl=D("0"),
        )
    entry = fill.open
    stop = entry * (D("1") - rules.stop_fraction)
    target = entry + (entry - stop) * rules.reward_multiple
    available_risk = rules.starting_capital * rules.risk_fraction
    shares = min(
        int((rules.max_position_notional / entry).to_integral_value(rounding=ROUND_FLOOR)),
        int((available_risk / (entry - stop)).to_integral_value(rounding=ROUND_FLOOR)),
    )
    if shares <= 0:
        return ResearchOutcome(
            **common,
            fill_at=None,
            exit_at=None,
            reason="risk_budget_too_small",
            shares=0,
            entry=None,
            exit=None,
            stop=None,
            target=None,
            net_pnl=D("0"),
        )
    exit_at = ordered[-1].opened_at + FIVE
    exit_price = ordered[-1].close
    reason = "session_close"
    for bar in ordered:
        if bar.opened_at < fill.opened_at:
            continue
        # Conservative within-candle ordering; unknown path => stop takes precedence.
        if bar.low <= stop:
            exit_price, exit_at, reason = stop, bar.opened_at + FIVE, "stop_first_conservative"
            break
        if bar.high >= target:
            exit_price, exit_at, reason = target, bar.opened_at + FIVE, "target_first"
            break
    costs = D(shares) * (entry + exit_price) * rules.cost_bps_each_side / D("10000")
    net = (D(shares) * (exit_price - entry) - costs).quantize(D("0.01"))
    return ResearchOutcome(
        **common,
        fill_at=fill.opened_at.isoformat(),
        exit_at=exit_at.isoformat(),
        reason=reason,
        shares=shares,
        entry=entry,
        exit=exit_price,
        stop=stop,
        target=target,
        net_pnl=net,
    )


def bootstrap_monte_carlo(
    outcomes: tuple[ResearchOutcome, ...], *, trials: int = 10_000, seed: int = 19
) -> dict[str, object]:
    """Empirical re-sampling only: never returns a calibrated future win probability.

    Output is intentionally monetary P/L distributions, not portfolio return
    forecasts. Historical order/reliability and regime dependence are NOT modeled.
    """
    if not 1 <= trials <= 20_000 or isinstance(trials, bool):
        raise ValueError("trials outside resource-bounded 1..20,000")
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= 2**32 - 1:
        raise ValueError("invalid reproducibility seed")
    if not 5 <= len(outcomes) <= 250:
        raise ResearchDataNotReady("at least five and at most 250 full synthetic sessions required")
    if any(o.data_class != SOURCE or o.orders_submitted != 0 for o in outcomes):
        raise ResearchDataNotReady("bootstrap must be synthetic and non-executable")
    if len({o.session for o in outcomes}) != len(outcomes):
        raise ResearchDataNotReady("duplicate synthetic sessions")
    pnl = [o.net_pnl for o in outcomes]
    if any(not x.is_finite() for x in pnl):
        raise ResearchDataNotReady("non-finite synthetic P/L")
    rng = random.Random(seed)  # noqa: S311 -- reproducible simulation, not cryptography
    paths = []
    for _ in range(trials):
        cumulative = D("0")
        peak = D("0")
        drawdown = D("0")
        for _ in pnl:
            cumulative += rng.choice(pnl)
            peak = max(peak, cumulative)
            drawdown = max(drawdown, peak - cumulative)
        paths.append((cumulative, drawdown))
    ending = sorted(x[0] for x in paths)
    risks = sorted(x[1] for x in paths)
    n = len(ending)
    return {
        "source_class": SOURCE,
        "research_only": True,
        "real_market_certified": False,
        "orders_submitted": 0,
        "upstream_reference": UPSTREAM,
        "trials": trials,
        "seed": seed,
        "sessions_resampled_per_trial": len(pnl),
        "positive_resample_fraction": sum(x > 0 for x in ending) / n,
        "p05_net_pnl_inr": str(ending[max(0, math.floor(n * 0.05) - 1)]),
        "median_net_pnl_inr": str(ending[n // 2]),
        "p95_net_pnl_inr": str(ending[min(n - 1, math.floor(n * 0.95))]),
        "median_drawdown_inr": str(risks[n // 2]),
        "warning": "Synthetic bootstrap frequency, NOT probability of future NSE gains.",
        "evidence_sha256": _digest(
            [(o.session, str(o.net_pnl), o.decision_hash, o.source_hash) for o in outcomes]
        ),
    }
