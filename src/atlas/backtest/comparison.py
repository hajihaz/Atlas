"""Compare a strategy against alternatives and a benchmark (goal 7).

Ranking is always on a **risk-adjusted** metric, never raw return (principle 1.2). The
benchmark (typically equal-weight buy-and-hold) is just another entry, so "did it beat
buy-and-hold on a risk-adjusted, cost-aware basis?" is answered directly.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from atlas.backtest.metrics import PerformanceMetrics, compute_metrics

_RANKABLE = {"sharpe", "sortino", "calmar", "expectancy", "total_return", "cagr", "profit_factor"}


@dataclass(frozen=True)
class RankedEntry:
    rank: int
    config_id: str
    metrics: PerformanceMetrics


@dataclass(frozen=True)
class Comparison:
    ranked: tuple[RankedEntry, ...]
    rank_by: str
    benchmark_id: str | None

    def best(self) -> RankedEntry:
        return self.ranked[0]

    def rank_of(self, config_id: str) -> int:
        for e in self.ranked:
            if e.config_id == config_id:
                return e.rank
        raise KeyError(config_id)

    def beats_benchmark(self, config_id: str) -> bool:
        if self.benchmark_id is None:
            raise ValueError("no benchmark set")
        return self.rank_of(config_id) < self.rank_of(self.benchmark_id)

    def table(self) -> list[dict[str, Any]]:
        return [{"rank": e.rank, "config": e.config_id, **e.metrics.summary()} for e in self.ranked]


def compare(
    returns_by_config: Mapping[str, Sequence[float]],
    periods_per_year: int,
    *,
    rank_by: str = "sharpe",
    benchmark_id: str | None = None,
) -> Comparison:
    """Rank configs by a risk-adjusted metric (descending)."""
    if rank_by not in _RANKABLE:
        raise ValueError(f"cannot rank by {rank_by!r}; choose from {sorted(_RANKABLE)}")
    scored = [
        (cid, compute_metrics(list(rets), periods_per_year))
        for cid, rets in returns_by_config.items()
    ]
    scored.sort(key=lambda kv: getattr(kv[1], rank_by), reverse=True)
    ranked = tuple(RankedEntry(i + 1, cid, m) for i, (cid, m) in enumerate(scored))
    return Comparison(ranked=ranked, rank_by=rank_by, benchmark_id=benchmark_id)
