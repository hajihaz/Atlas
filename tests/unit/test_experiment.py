"""Experiment runner + comparison + trial-ledger integration (goals 7 & 8)."""

from __future__ import annotations

import datetime as dt
import unittest

from atlas.backtest.comparison import compare
from atlas.common.time_utils import UTC
from atlas.research.dataview import InMemoryBarSource
from atlas.research.experiment import run_experiment
from atlas.research.synthetic import random_walk, sessions, unbounded_calendar
from atlas.strategy import BuyAndHold, CrossSectionalMomentum
from atlas.trials import TrialLedger


class TestComparison(unittest.TestCase):
    def test_ranks_and_benchmark(self):
        cmp = compare(
            {"a": [0.02, 0.01, 0.015], "b": [0.001, -0.002, 0.0]},
            periods_per_year=252,
            rank_by="sharpe",
            benchmark_id="b",
        )
        self.assertEqual(cmp.best().config_id, "a")
        self.assertTrue(cmp.beats_benchmark("a"))


class TestExperiment(unittest.TestCase):
    def setUp(self):
        self.cal = unbounded_calendar()
        self.dates = sessions(self.cal, dt.date(2022, 1, 3), dt.date(2023, 6, 30))
        src = {
            f"S{i}": random_walk(f"S{i}", self.dates, seed=i, drift=0.0004 + 0.0001 * i)
            for i in range(4)
        }
        self.source = InMemoryBarSource(src)
        self.start, self.end = self.dates[60], self.dates[-1]
        self.as_of = dt.datetime(2023, 7, 1, 12, 0, tzinfo=UTC)

    def test_experiment_records_one_trial_per_config(self):
        ledger = TrialLedger()
        grid = [{"lookback": lb, "top_k": 2} for lb in (5, 10, 20)]
        report = run_experiment(
            strategy_factory=lambda p: CrossSectionalMomentum(p["lookback"], p["top_k"]),
            param_grid=grid,
            source=self.source,
            start=self.start,
            end=self.end,
            calendar=self.cal,
            ledger=ledger,
            as_of=self.as_of,
            seed=1,
            pbo_splits=8,
            benchmark=BuyAndHold(),
        )
        # One trial per config in the family (the honest multiplicity denominator).
        self.assertEqual(report.trial_family_count, len(grid))
        ledger.verify_integrity()  # append-only chain intact after all the writes
        self.assertIn(report.best_config_id, report.results)
        self.assertIsInstance(report.verdict.passed, bool)
        self.assertIsNotNone(report.pbo)
        self.assertGreaterEqual(report.walk_forward.oos_sharpe, -10.0)
        self.assertGreaterEqual(report.monte_carlo.prob_positive, 0.0)
        self.assertLessEqual(report.monte_carlo.prob_positive, 1.0)
        self.assertGreaterEqual(report.sensitivity.frac_positive, 0.0)
        self.assertLessEqual(report.sensitivity.frac_positive, 1.0)
        self.assertIn("walk_forward", report.verdict.checks)
        self.assertIn("monte_carlo", report.verdict.checks)
        self.assertIn("sensitivity", report.verdict.checks)
        # The benchmark is in the comparison but not counted as a strategy trial.
        self.assertGreaterEqual(len(report.comparison.ranked), len(grid) + 1)
        self.assertIn("verdict", report.summary())


if __name__ == "__main__":
    unittest.main()
