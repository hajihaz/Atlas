"""Performance, risk, and — first and foremost — **expectancy** metrics.

Atlas leads with *expectancy* and *risk-adjusted* measures, never win rate or raw return
(principles 1.1, 1.2). Every metric here is computed on **net** returns (after costs).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from atlas.backtest.stats import mean, quantile, stdev


# --------------------------------------------------------------------------- ratios
def sharpe(returns: Sequence[float], rf_per_period: float = 0.0) -> float:
    """Per-period Sharpe (not annualized): mean excess return / volatility."""
    sd = stdev(returns)
    return (mean(returns) - rf_per_period) / sd if sd > 0 else 0.0


def annualized_sharpe(returns: Sequence[float], periods_per_year: int, rf: float = 0.0) -> float:
    return sharpe(returns, rf / periods_per_year) * math.sqrt(periods_per_year)


def downside_deviation(returns: Sequence[float], target: float = 0.0) -> float:
    lows = [min(r - target, 0.0) ** 2 for r in returns]
    return math.sqrt(mean(lows)) if lows else 0.0


def sortino(returns: Sequence[float], periods_per_year: int, target: float = 0.0) -> float:
    dd = downside_deviation(returns, target)
    return (mean(returns) - target) / dd * math.sqrt(periods_per_year) if dd > 0 else 0.0


# --------------------------------------------------------------------------- equity/dd
def equity_curve(returns: Sequence[float], start: float = 1.0) -> list[float]:
    out, e = [], start
    for r in returns:
        e *= 1.0 + r
        out.append(e)
    return out


def cagr(returns: Sequence[float], periods_per_year: int) -> float:
    if not returns:
        return 0.0
    total = equity_curve(returns)[-1]
    years = len(returns) / periods_per_year
    return total ** (1 / years) - 1.0 if years > 0 and total > 0 else 0.0


@dataclass(frozen=True)
class Drawdown:
    max_depth: float  # most negative peak-to-trough (e.g. -0.23)
    max_duration: int  # longest run of sessions below a prior peak
    time_to_recover: int  # sessions from the max-DD trough back to a new high (-1 if none)


def drawdown(returns: Sequence[float]) -> Drawdown:
    eq = equity_curve(returns)
    if not eq:
        return Drawdown(0.0, 0, 0)
    peak, max_depth, trough_i, peak_i_at_trough = eq[0], 0.0, 0, 0
    cur_peak_i, max_dur = 0, 0
    for i, e in enumerate(eq):
        if e >= peak:
            peak, cur_peak_i = e, i
        else:
            max_dur = max(max_dur, i - cur_peak_i)
        depth = e / peak - 1.0
        if depth < max_depth:
            max_depth, trough_i, peak_i_at_trough = depth, i, cur_peak_i
    # recovery: first index after the trough that regains the pre-drawdown peak
    recover = -1
    peak_level = eq[peak_i_at_trough]
    for j in range(trough_i, len(eq)):
        if eq[j] >= peak_level:
            recover = j - trough_i
            break
    return Drawdown(max_depth, max_dur, recover)


def calmar(returns: Sequence[float], periods_per_year: int) -> float:
    dd = drawdown(returns).max_depth
    return cagr(returns, periods_per_year) / abs(dd) if dd < 0 else 0.0


# --------------------------------------------------------------------------- expectancy
@dataclass(frozen=True)
class Expectancy:
    """Expectancy = the average outcome per period. A strategy can have a LOW win rate and
    still be excellent if its payoff is asymmetric — which is exactly why Atlas ranks on this,
    not on win rate (principle 1.1)."""

    per_period: float  # mean net return per period (the expectancy)
    win_rate: float
    avg_win: float
    avg_loss: float  # negative
    payoff_ratio: float  # avg_win / |avg_loss|
    profit_factor: float  # gross profit / gross loss


def expectancy(returns: Sequence[float]) -> Expectancy:
    wins = [r for r in returns if r > 0]
    losses = [r for r in returns if r < 0]
    n = len(returns) or 1
    avg_win = mean(wins) if wins else 0.0
    avg_loss = mean(losses) if losses else 0.0
    gross_profit, gross_loss = sum(wins), -sum(losses)
    return Expectancy(
        per_period=mean(returns),
        win_rate=len(wins) / n,
        avg_win=avg_win,
        avg_loss=avg_loss,
        payoff_ratio=(avg_win / -avg_loss) if avg_loss < 0 else 0.0,
        profit_factor=(gross_profit / gross_loss) if gross_loss > 0 else 0.0,
    )


# --------------------------------------------------------------------------- tail risk
def value_at_risk(returns: Sequence[float], alpha: float = 0.05) -> float:
    """Historical VaR at ``alpha`` (a negative number): the alpha-quantile loss."""
    return quantile(returns, alpha)


def conditional_var(returns: Sequence[float], alpha: float = 0.05) -> float:
    """Expected shortfall: mean of returns at or below the VaR threshold."""
    var = value_at_risk(returns, alpha)
    tail = [r for r in returns if r <= var]
    return mean(tail) if tail else var


def tail_ratio(returns: Sequence[float]) -> float:
    right = abs(quantile(returns, 0.95))
    left = abs(quantile(returns, 0.05))
    return right / left if left > 0 else 0.0


# --------------------------------------------------------------------------- bundle
@dataclass(frozen=True)
class PerformanceMetrics:
    n_periods: int
    total_return: float
    cagr: float
    volatility: float
    sharpe: float
    sortino: float
    calmar: float
    max_drawdown: float
    max_drawdown_duration: int
    expectancy: float
    win_rate: float
    payoff_ratio: float
    profit_factor: float
    var_95: float
    cvar_95: float
    tail_ratio: float

    def summary(self) -> dict[str, float | int]:
        return {k: (round(v, 6) if isinstance(v, float) else v) for k, v in self.__dict__.items()}


def compute_metrics(
    returns: Sequence[float], periods_per_year: int, rf: float = 0.0
) -> PerformanceMetrics:
    exp = expectancy(returns)
    dd = drawdown(returns)
    return PerformanceMetrics(
        n_periods=len(returns),
        total_return=(equity_curve(returns)[-1] - 1.0) if returns else 0.0,
        cagr=cagr(returns, periods_per_year),
        volatility=stdev(returns) * math.sqrt(periods_per_year),
        sharpe=annualized_sharpe(returns, periods_per_year, rf),
        sortino=sortino(returns, periods_per_year),
        calmar=calmar(returns, periods_per_year),
        max_drawdown=dd.max_depth,
        max_drawdown_duration=dd.max_duration,
        expectancy=exp.per_period,
        win_rate=exp.win_rate,
        payoff_ratio=exp.payoff_ratio,
        profit_factor=exp.profit_factor,
        var_95=value_at_risk(returns, 0.05),
        cvar_95=conditional_var(returns, 0.05),
        tail_ratio=tail_ratio(returns),
    )
