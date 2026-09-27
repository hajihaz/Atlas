"""Atlas backtesting engine (Phase 3).

A point-in-time, reproducible, cost-aware simulation of a strategy, plus the metrics,
overfitting defenses, robustness protocols, and comparison that turn a run into *evidence*.
Pure standard library — the deterministic evidence path (ADR 0005 / ADR 0015).
"""

from __future__ import annotations

from atlas.backtest.comparison import Comparison, compare
from atlas.backtest.costs import CostModel
from atlas.backtest.engine import run_backtest
from atlas.backtest.metrics import PerformanceMetrics, compute_metrics
from atlas.backtest.overfitting import (
    deflated_sharpe,
    probabilistic_sharpe,
    probability_of_backtest_overfitting,
)
from atlas.backtest.result import BacktestResult

__all__ = [
    "BacktestResult",
    "Comparison",
    "CostModel",
    "PerformanceMetrics",
    "compare",
    "compute_metrics",
    "deflated_sharpe",
    "probabilistic_sharpe",
    "probability_of_backtest_overfitting",
    "run_backtest",
]
