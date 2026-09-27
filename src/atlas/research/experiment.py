"""The experiment runner — the spine of the research funnel (goals 5-8).

Given a strategy family (a factory + a parameter grid), it:

1. backtests **every** config, point-in-time and cost-aware;
2. **records one trial per config** in the trial ledger — automatically, so the multiplicity
   denominator is honest by construction, not by human diligence (closes the Phase-2 gap);
3. computes overfitting defenses (PBO across configs; deflated Sharpe against the family's
   trial set) and robustness (out-of-sample, walk-forward, Monte-Carlo, sensitivity);
4. ranks against alternatives and a benchmark;
5. renders a pre-declared **evidence-gate verdict** on the best config and records it.

Everything is deterministic given (snapshot, params, seed, as_of) — ADR 0015.
"""

from __future__ import annotations

import datetime as _dt
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from atlas.backtest.comparison import Comparison, compare
from atlas.backtest.costs import CostModel
from atlas.backtest.engine import run_backtest
from atlas.backtest.metrics import compute_metrics, drawdown
from atlas.backtest.overfitting import (
    PBOResult,
    deflated_sharpe,
    per_period_sharpe,
    probability_of_backtest_overfitting,
)
from atlas.backtest.result import BacktestResult
from atlas.backtest.validation import (
    monte_carlo,
    out_of_sample,
    parameter_sensitivity,
    walk_forward,
)
from atlas.common.types import TrialStatus
from atlas.data.calendars.nse_calendar import TradingCalendar
from atlas.research.dataview import BarSource
from atlas.research.gates import Evidence, EvidenceGates, GateVerdict, evaluate_gates
from atlas.strategy.base import Strategy
from atlas.trials.ledger import TrialLedger, TrialRecord


@dataclass(frozen=True)
class ExperimentReport:
    family_id: str
    results: Mapping[str, BacktestResult]
    comparison: Comparison
    pbo: PBOResult | None
    best_config_id: str
    evidence: Evidence
    verdict: GateVerdict
    trial_family_count: int  # the multiplicity denominator, straight from the ledger
    walk_forward: Any
    monte_carlo: Any
    sensitivity: Any

    def summary(self) -> dict[str, Any]:
        return {
            "family": self.family_id,
            "configs_tried": self.trial_family_count,
            "best": self.best_config_id,
            "verdict": self.verdict.status_word,
            "reasons": list(self.verdict.reasons),
            "deflated_sharpe": round(self.evidence.deflated_sharpe, 4),
            "pbo": round(self.pbo.pbo, 4) if self.pbo else None,
            "oos_degradation": round(self.evidence.oos_degradation, 4),
            "walk_forward_sharpe": round(self.evidence.walk_forward_sharpe, 4),
            "monte_carlo_prob_positive": round(self.evidence.monte_carlo_prob_positive, 4),
            "sensitivity_frac_positive": round(self.evidence.sensitivity_frac_positive, 4),
        }


def run_experiment(
    *,
    strategy_factory: Callable[[Mapping[str, Any]], Strategy],
    param_grid: Sequence[Mapping[str, Any]],
    source: BarSource,
    start: _dt.date,
    end: _dt.date,
    calendar: TradingCalendar,
    ledger: TrialLedger,
    as_of: _dt.datetime,
    snapshot_id: str | None = None,
    seed: int | None = None,
    code_version: str | None = None,
    cost_model: CostModel | None = None,
    periods_per_year: int = 252,
    gates: EvidenceGates | None = None,
    benchmark: Strategy | None = None,
    pbo_splits: int = 16,
    walk_forward_folds: int = 5,
    monte_carlo_sims: int = 1000,
    monte_carlo_block: int = 1,
) -> ExperimentReport:
    if not param_grid:
        raise ValueError("param_grid is empty")

    strategies = [strategy_factory(p) for p in param_grid]
    family_id = strategies[0].spec.family_id()

    # 1-2. Backtest every config and record a trial per config (COMPLETED).
    results: dict[str, BacktestResult] = {}
    returns_by_config: dict[str, list[float]] = {}
    for strat in strategies:
        res = run_backtest(
            strat,
            source,
            start=start,
            end=end,
            calendar=calendar,
            cost_model=cost_model,
            periods_per_year=periods_per_year,
            snapshot_id=snapshot_id,
            seed=seed,
            code_version=code_version,
        )
        cid = strat.spec.config_id()
        results[cid] = res
        returns_by_config[cid] = list(res.net_returns)
        metrics = compute_metrics(res.net_returns, periods_per_year)
        ledger.append(
            TrialRecord(
                trial_id=cid,
                family_id=family_id,
                status=TrialStatus.COMPLETED,
                recorded_at=as_of,
                spec={
                    "strategy": strat.spec.name,
                    "version": strat.spec.version,
                    "params": dict(strat.spec.params),
                },
                data_snapshot_id=snapshot_id,
                seed=seed,
                code_version=code_version,
                metrics=metrics.summary(),
            )
        )

    # 3. Overfitting: PBO across configs + the family's per-period Sharpe set for deflation.
    trial_sharpes = [per_period_sharpe(returns_by_config[c]) for c in returns_by_config]
    pbo: PBOResult | None = None
    if len(returns_by_config) >= 2:
        try:
            pbo = probability_of_backtest_overfitting(
                list(returns_by_config.values()), n_splits=pbo_splits
            )
        except ValueError:
            pbo = None  # not enough observations for the requested splits

    # 4. Robustness is part of the evidence, not an optional afterthought.
    # Walk-forward re-selects on prior data only; Monte-Carlo stresses the selected curve;
    # sensitivity checks whether the edge is a plateau rather than a lone parameter spike.
    if len(returns_by_config) < 2:
        raise ValueError("robustness suite requires at least two strategy configurations")
    config_ids = list(returns_by_config)
    wf = walk_forward(
        [returns_by_config[cid] for cid in config_ids],
        config_ids,
        periods_per_year,
        n_folds=walk_forward_folds,
    )

    # 5. Compare (optionally include the benchmark as its own entry/family).
    comparison_inputs = dict(returns_by_config)
    benchmark_id: str | None = None
    if benchmark is not None:
        bench_res = run_backtest(
            benchmark,
            source,
            start=start,
            end=end,
            calendar=calendar,
            cost_model=cost_model,
            periods_per_year=periods_per_year,
            snapshot_id=snapshot_id,
            code_version=code_version,
        )
        benchmark_id = benchmark.spec.config_id()
        comparison_inputs[benchmark_id] = list(bench_res.net_returns)
        results[benchmark_id] = bench_res
    comparison = compare(
        comparison_inputs, periods_per_year, rank_by="sharpe", benchmark_id=benchmark_id
    )

    # 6. Evidence + gate verdict on the best *strategy* config (exclude the benchmark).
    best_id = next(e.config_id for e in comparison.ranked if e.config_id in returns_by_config)
    best_returns = returns_by_config[best_id]
    best_metrics = compute_metrics(best_returns, periods_per_year)
    mc = monte_carlo(
        best_returns,
        n_sims=monte_carlo_sims,
        seed=seed if seed is not None else 0,
        block=monte_carlo_block,
    )
    sensitivity = parameter_sensitivity(
        [compute_metrics(returns_by_config[cid], periods_per_year).sharpe for cid in config_ids]
    )
    oos = out_of_sample(best_returns, periods_per_year)
    evidence = Evidence(
        annualized_sharpe=best_metrics.sharpe,
        deflated_sharpe=deflated_sharpe(best_returns, trial_sharpes),
        pbo=pbo.pbo if pbo else 0.0,
        max_drawdown=drawdown(best_returns).max_depth,
        oos_degradation=oos.degradation,
        n_periods=len(best_returns),
        expectancy=best_metrics.expectancy,
        walk_forward_sharpe=wf.oos_sharpe,
        monte_carlo_prob_positive=mc.prob_positive,
        sensitivity_frac_positive=sensitivity.frac_positive,
    )
    verdict = evaluate_gates(evidence, gates)

    # Record the promotion/rejection as an append-only status change on the best trial.
    promotion_metrics = {
        **best_metrics.summary(),
        "result_hash": results[best_id].result_hash(),
        "walk_forward_sharpe": wf.oos_sharpe,
        "walk_forward_selected_configs": list(wf.selected_per_fold),
        "walk_forward_pooled_is_sharpe": wf.pooled_is_sharpe,
        "monte_carlo_prob_positive": mc.prob_positive,
        "monte_carlo_p05_total_return": mc.p05_total_return,
        "monte_carlo_p05_max_drawdown": mc.p95_max_drawdown,
        "monte_carlo_median_max_drawdown": mc.median_max_drawdown,
        "sensitivity_frac_positive": sensitivity.frac_positive,
        "sensitivity_stability": sensitivity.stability,
        "gate_checks": dict(verdict.checks),
    }
    ledger.append(
        TrialRecord(
            trial_id=best_id,
            family_id=family_id,
            status=TrialStatus.PROMOTED if verdict.passed else TrialStatus.REJECTED,
            recorded_at=as_of,
            spec={"selected_as": "family_best"},
            data_snapshot_id=snapshot_id,
            seed=seed,
            code_version=code_version,
            metrics=promotion_metrics,
            verdict=verdict.status_word,
            note="; ".join(verdict.reasons) or "passed all evidence gates",
        )
    )

    return ExperimentReport(
        family_id=family_id,
        results=results,
        comparison=comparison,
        pbo=pbo,
        best_config_id=best_id,
        evidence=evidence,
        verdict=verdict,
        trial_family_count=ledger.family_trial_count(family_id),
        walk_forward=wf,
        monte_carlo=mc,
        sensitivity=sensitivity,
    )
