"""Leak-proof DataView, deterministic engine, and metrics."""

from __future__ import annotations

import datetime as dt
import unittest
from decimal import Decimal

from atlas.backtest import CostModel, run_backtest
from atlas.backtest.metrics import compute_metrics, drawdown, expectancy, value_at_risk
from atlas.common.errors import PointInTimeViolation
from atlas.research.dataview import DataView, InMemoryBarSource
from atlas.research.synthetic import random_walk, sessions, unbounded_calendar
from atlas.strategy import BuyAndHold, Strategy, StrategySpec


def _bar(iid, day, close):
    c = Decimal(str(close))
    from atlas.data.market.records import OHLCVBar

    return OHLCVBar(iid, day, c, c, c, c, 100, "t")


class TestLeakProofView(unittest.TestCase):
    def setUp(self):
        self.d1, self.d2, self.d3 = (dt.date(2024, 3, d) for d in (11, 12, 13))
        src = InMemoryBarSource(
            {"X": [_bar("X", self.d1, 100), _bar("X", self.d2, 101), _bar("X", self.d3, 102)]}
        )
        self.view = DataView(src, decision_date=self.d2)

    def test_history_is_strictly_past(self):
        hist = self.view.history("X")
        self.assertEqual([b.event_date for b in hist], [self.d1])  # d2/d3 invisible
        self.assertEqual(self.view.last_close("X"), Decimal("100"))

    def test_bar_on_future_raises(self):
        with self.assertRaises(PointInTimeViolation):
            self.view.bar_on("X", self.d2)  # the decision day itself
        with self.assertRaises(PointInTimeViolation):
            self.view.bar_on("X", self.d3)
        self.assertIsNotNone(self.view.bar_on("X", self.d1))  # the past is fine


class TestEngineDeterminism(unittest.TestCase):
    def setUp(self):
        self.cal = unbounded_calendar()
        self.dates = sessions(self.cal, dt.date(2023, 1, 2), dt.date(2023, 12, 29))
        bars = random_walk("A", self.dates, seed=1, drift=0.0006)
        self.src = InMemoryBarSource({"A": bars})

    def test_reproducible_result_hash(self):
        kw = dict(start=self.dates[20], end=self.dates[-1], calendar=self.cal, seed=7)
        a = run_backtest(BuyAndHold(), self.src, **kw)
        b = run_backtest(BuyAndHold(), self.src, **kw)
        self.assertEqual(a.result_hash(), b.result_hash())

    def test_costs_reduce_return(self):
        kw = dict(start=self.dates[20], end=self.dates[-1], calendar=self.cal)
        cheap = run_backtest(BuyAndHold(), self.src, cost_model=CostModel(0.0), **kw)
        dear = run_backtest(BuyAndHold(), self.src, cost_model=CostModel(50.0), **kw)
        self.assertGreater(cheap.total_return, dear.total_return)

    def test_buy_and_hold_tracks_uptrend(self):
        res = run_backtest(
            BuyAndHold(),
            self.src,
            start=self.dates[20],
            end=self.dates[-1],
            calendar=self.cal,
            cost_model=CostModel(0.0),
        )
        self.assertGreater(res.total_return, 0.0)  # a drifting-up series

    def test_decision_is_lagged_one_session(self):
        # A strategy sees only history at D; the D decision must not earn D-1→D.
        class EnterOnSecondDecision(Strategy):
            def __init__(self):
                super().__init__(StrategySpec("decision_lag_probe", "1"))
                self.calls = []

            def target_weights(self, view):
                self.calls.append(view.decision_date)
                return {iid: 1.0 / len(view.instruments()) for iid in view.instruments()}

        strategy = EnterOnSecondDecision()
        res = run_backtest(
            strategy,
            self.src,
            start=self.dates[20],
            end=self.dates[23],
            calendar=self.cal,
            cost_model=CostModel(0.0),
        )
        self.assertEqual(res.dates, tuple(self.dates[20:23]))
        self.assertEqual(strategy.calls, self.dates[20:23])


class TestMetrics(unittest.TestCase):
    def test_expectancy_decomposition(self):
        exp = expectancy([0.1, -0.05, 0.1, -0.05])
        self.assertAlmostEqual(exp.per_period, 0.025)
        self.assertAlmostEqual(exp.win_rate, 0.5)
        self.assertAlmostEqual(exp.payoff_ratio, 2.0)

    def test_low_win_rate_can_have_positive_expectancy(self):
        # 1 big win, 3 small losses -> win rate 25% but positive expectancy (principle 1.1).
        exp = expectancy([0.30, -0.02, -0.02, -0.02])
        self.assertLess(exp.win_rate, 0.5)
        self.assertGreater(exp.per_period, 0.0)

    def test_max_drawdown(self):
        dd = drawdown([0.10, -0.20, 0.05])  # eq: 1.1, 0.88, 0.924
        self.assertAlmostEqual(dd.max_depth, 0.88 / 1.1 - 1.0, places=6)

    def test_var_is_a_loss_quantile(self):
        self.assertLess(value_at_risk([-0.05, -0.02, 0.01, 0.03, 0.04], 0.05), 0.0)

    def test_metrics_bundle_runs(self):
        m = compute_metrics([0.01, -0.005, 0.02, -0.01, 0.015], periods_per_year=252)
        self.assertEqual(m.n_periods, 5)


if __name__ == "__main__":
    unittest.main()
