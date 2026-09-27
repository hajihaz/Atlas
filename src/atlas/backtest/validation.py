"""Robustness protocols: out-of-sample, walk-forward, Monte-Carlo, parameter sensitivity.

A single in-sample backtest proves almost nothing. These protocols stress a result the ways
a real deployment will: held-out data, rolling re-selection, resampled histories, and
parameter-plateau checks. Deterministic (Monte-Carlo takes an explicit seed) — ADR 0015.
"""

from __future__ import annotations

import random
from collections.abc import Sequence
from dataclasses import dataclass

from atlas.backtest.metrics import annualized_sharpe, drawdown, equity_curve
from atlas.backtest.stats import mean, quantile, stdev


# --------------------------------------------------------------------------- OOS split
@dataclass(frozen=True)
class OutOfSampleResult:
    train_sharpe: float
    test_sharpe: float
    degradation: float  # test - train (negative = worse OOS, the usual overfitting sign)


def out_of_sample(
    returns: Sequence[float], periods_per_year: int, train_frac: float = 0.7
) -> OutOfSampleResult:
    cut = int(len(returns) * train_frac)
    train, test = returns[:cut], returns[cut:]
    tr = annualized_sharpe(train, periods_per_year)
    te = annualized_sharpe(test, periods_per_year)
    return OutOfSampleResult(tr, te, te - tr)


# --------------------------------------------------------------------------- walk-forward
@dataclass(frozen=True)
class WalkForwardResult:
    oos_returns: tuple[float, ...]
    selected_per_fold: tuple[str, ...]
    oos_sharpe: float
    pooled_is_sharpe: float


def walk_forward(
    returns_by_config: Sequence[Sequence[float]],
    config_ids: Sequence[str],
    periods_per_year: int,
    n_folds: int = 5,
) -> WalkForwardResult:
    """Rolling re-selection: in each fold, pick the best config on all prior folds (in-sample)
    and record its returns on the current fold (out-of-sample). Stitches an honest OOS curve
    that reflects the *selection* process, not a single hindsight-chosen config.
    """
    n_configs = len(returns_by_config)
    t = min(len(c) for c in returns_by_config)
    fold = t // n_folds
    if fold == 0 or n_configs == 0:
        raise ValueError("insufficient data/configs for walk-forward")
    oos: list[float] = []
    selected: list[str] = []
    is_pool: list[float] = []
    for f in range(1, n_folds):
        train_end = f * fold
        test_slice = slice(f * fold, (f + 1) * fold)
        is_sharpes = [
            annualized_sharpe(list(returns_by_config[n][:train_end]), periods_per_year)
            for n in range(n_configs)
        ]
        best = max(range(n_configs), key=lambda n: is_sharpes[n])
        selected.append(config_ids[best])
        oos.extend(returns_by_config[best][test_slice])
        is_pool.extend(returns_by_config[best][:train_end])
    return WalkForwardResult(
        oos_returns=tuple(oos),
        selected_per_fold=tuple(selected),
        oos_sharpe=annualized_sharpe(oos, periods_per_year),
        pooled_is_sharpe=annualized_sharpe(is_pool, periods_per_year),
    )


# --------------------------------------------------------------------------- Monte-Carlo
@dataclass(frozen=True)
class MonteCarloResult:
    n_sims: int
    seed: int
    prob_positive: float
    median_total_return: float
    p05_total_return: float  # a conservative (5th-percentile) outcome
    p95_max_drawdown: float  # a conservative (deep) drawdown estimate (negative)
    median_max_drawdown: float


def monte_carlo(
    returns: Sequence[float], *, n_sims: int = 1000, seed: int, block: int = 1
) -> MonteCarloResult:
    """Bootstrap the return history ``n_sims`` times to get a distribution of outcomes.

    ``block > 1`` uses a moving-block bootstrap (resamples contiguous blocks) to preserve
    short-run autocorrelation. Seeded, so the result is exactly reproducible.
    """
    if not returns:
        raise ValueError("cannot Monte-Carlo an empty return series")
    rng = random.Random(seed)  # noqa: S311 - deterministic simulation, not security
    n = len(returns)
    totals: list[float] = []
    max_dds: list[float] = []
    for _ in range(n_sims):
        if block <= 1:
            sample = [returns[rng.randrange(n)] for _ in range(n)]
        else:
            sample = []
            while len(sample) < n:
                start = rng.randrange(n)
                sample.extend(returns[start : start + block])
            sample = sample[:n]
        totals.append(equity_curve(sample)[-1] - 1.0)
        max_dds.append(drawdown(sample).max_depth)
    return MonteCarloResult(
        n_sims=n_sims,
        seed=seed,
        prob_positive=mean([1.0 if x > 0 else 0.0 for x in totals]),
        median_total_return=quantile(totals, 0.5),
        p05_total_return=quantile(totals, 0.05),
        p95_max_drawdown=quantile(max_dds, 0.05),  # 5th pct of a negative series = deep DD
        median_max_drawdown=quantile(max_dds, 0.5),
    )


# --------------------------------------------------------------------------- sensitivity
@dataclass(frozen=True)
class SensitivityResult:
    mean: float
    stdev: float
    best: float
    worst: float
    frac_positive: float
    stability: float  # mean/stdev — a plateau (robust) scores high; a lone spike scores low


def parameter_sensitivity(metric_by_config: Sequence[float]) -> SensitivityResult:
    """Summarize a performance metric across a parameter grid. A robust edge is a *plateau*
    (many configs work); a lone spike surrounded by failures is the signature of overfitting."""
    if not metric_by_config:
        raise ValueError("no configs to summarize")
    m, sd = mean(metric_by_config), stdev(metric_by_config)
    return SensitivityResult(
        mean=m,
        stdev=sd,
        best=max(metric_by_config),
        worst=min(metric_by_config),
        frac_positive=mean([1.0 if x > 0 else 0.0 for x in metric_by_config]),
        stability=(m / sd) if sd > 0 else 0.0,
    )
