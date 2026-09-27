"""Overfitting defenses — the heart of "believable backtests" (ADR 0016).

Implements the Bailey & López de Prado family of tests, in pure stdlib:

* **Probabilistic Sharpe Ratio (PSR)** — confidence that the true Sharpe exceeds a benchmark,
  correcting for track-record length, skewness, and kurtosis.
* **Deflated Sharpe Ratio (DSR)** — PSR against the *expected maximum* Sharpe under the number
  of trials tried. This is where the **trial-ledger multiplicity count** enters: mine 1,000
  configs and the bar you must clear rises accordingly (ADR 0005 / 0012).
* **Minimum Track Record Length (MinTRL)** — how much history you'd need for significance.
* **Probability of Backtest Overfitting (PBO)** via Combinatorially-Symmetric Cross-Validation
  — the fraction of splits where the in-sample-best config underperforms out-of-sample.

Overfitting is the *default* outcome of naive backtesting; these tests exist to reject it.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from itertools import combinations
from statistics import NormalDist

from atlas.backtest.stats import kurtosis, mean, skewness, stdev

_N = NormalDist()
_EULER = 0.5772156649015329


def _psr_denominator(sr: float, skew: float, kurt: float) -> float:
    # Var of the Sharpe estimator (per Bailey/LdP), guarded to stay positive.
    return math.sqrt(max(1.0 - skew * sr + ((kurt - 1.0) / 4.0) * sr * sr, 1e-12))


def per_period_sharpe(returns: Sequence[float]) -> float:
    sd = stdev(returns)
    return mean(returns) / sd if sd > 0 else 0.0


def probabilistic_sharpe(returns: Sequence[float], benchmark_sr: float = 0.0) -> float:
    """P(true per-period Sharpe > ``benchmark_sr``), correcting for n, skew, kurtosis."""
    n = len(returns)
    if n < 2:
        return 0.0
    sr = per_period_sharpe(returns)
    denom = _psr_denominator(sr, skewness(returns), kurtosis(returns))
    return _N.cdf((sr - benchmark_sr) * math.sqrt(n - 1) / denom)


def expected_max_sharpe(trial_sharpes: Sequence[float]) -> float:
    """Expected maximum per-period Sharpe under ``N`` trials with the observed cross-trial
    variance — the bar a strategy must beat to be more than a lucky draw (Bailey/LdP)."""
    n = len(trial_sharpes)
    if n < 2:
        return 0.0
    v = stdev(trial_sharpes)
    if v == 0:
        return 0.0
    return v * (
        (1 - _EULER) * _N.inv_cdf(1 - 1.0 / n) + _EULER * _N.inv_cdf(1 - 1.0 / (n * math.e))
    )


def deflated_sharpe(returns: Sequence[float], trial_sharpes: Sequence[float]) -> float:
    """Deflated Sharpe Ratio: PSR against the expected-max Sharpe of the trial set.

    ``trial_sharpes`` are the per-period Sharpe ratios of **every** config tried in this
    strategy family (from the trial ledger). More trials ⇒ higher bar ⇒ lower DSR — this is
    the multiple-testing correction made concrete.
    """
    sr0 = expected_max_sharpe(trial_sharpes)
    return probabilistic_sharpe(returns, benchmark_sr=sr0)


def min_track_record_length(
    returns: Sequence[float], benchmark_sr: float = 0.0, confidence: float = 0.95
) -> float:
    """Observations needed for PSR(benchmark) to reach ``confidence`` (inf if SR ≤ benchmark)."""
    sr = per_period_sharpe(returns)
    if sr <= benchmark_sr:
        return math.inf
    denom_sq = _psr_denominator(sr, skewness(returns), kurtosis(returns)) ** 2
    return 1.0 + denom_sq * (_N.inv_cdf(confidence) / (sr - benchmark_sr)) ** 2


@dataclass(frozen=True)
class PBOResult:
    pbo: float  # probability of backtest overfitting in [0, 1]
    n_configs: int
    n_splits: int
    n_combinations: int


def probability_of_backtest_overfitting(
    perf_by_config: Sequence[Sequence[float]], n_splits: int = 16
) -> PBOResult:
    """PBO via CSCV. ``perf_by_config`` is N configs x T aligned per-period returns.

    Splits T into ``n_splits`` blocks; over every balanced IS/OOS combination, checks whether
    the in-sample-best config lands below the out-of-sample median. High PBO ⇒ the selection
    process overfits (the winner is likely luck).
    """
    n_configs = len(perf_by_config)
    if n_configs < 2:
        raise ValueError("PBO needs at least two configurations to compare")
    t = min(len(c) for c in perf_by_config)
    if n_splits % 2 != 0 or n_splits < 2:
        raise ValueError("n_splits must be a positive even number")
    block = t // n_splits
    if block == 0:
        raise ValueError(f"not enough observations ({t}) for {n_splits} splits")
    blocks = [list(range(i * block, (i + 1) * block)) for i in range(n_splits)]

    below_median = 0
    total = 0
    for is_blocks in combinations(range(n_splits), n_splits // 2):
        is_idx = [i for b in is_blocks for i in blocks[b]]
        oos_set = set(range(n_splits)) - set(is_blocks)
        oos_idx = [i for b in sorted(oos_set) for i in blocks[b]]
        is_perf = [
            per_period_sharpe([perf_by_config[n][i] for i in is_idx]) for n in range(n_configs)
        ]
        oos_perf = [
            per_period_sharpe([perf_by_config[n][i] for i in oos_idx]) for n in range(n_configs)
        ]
        best = max(range(n_configs), key=lambda n: is_perf[n])
        rank = 1 + sum(1 for x in oos_perf if x < oos_perf[best])  # 1..N ascending
        omega = rank / (n_configs + 1)
        if math.log(omega / (1 - omega)) < 0:  # IS-best below OOS median
            below_median += 1
        total += 1
    return PBOResult(below_median / total, n_configs, n_splits, total)
