"""Offline Atlas x Day Trader Skill acceptance, stdlib-only; no market API."""
from __future__ import annotations

import datetime as dt
import unittest
from dataclasses import replace
from decimal import Decimal as D

from atlas.data.calendars.nse_calendar import TradingCalendar
from atlas.research.daytrader_nse import (
    IST, Candle5m, ResearchDataNotReady, ResearchRules,
    bootstrap_monte_carlo, replay_session, validate_session,
)


def cal(start: dt.date, end: dt.date, holidays=()) -> TradingCalendar:
    return TradingCalendar("NSE-CASH-SYNTHETIC", frozenset(holidays),
                           covered_from=start, covered_to=end)


from atlas.research.daytrader_nse_synthetic import synthetic_session as fixture

class TestDayTraderNSE(unittest.TestCase):
    DAY = dt.date(2026, 10, 6)

    def bars(self, scenario="target"):
        return fixture(self.DAY, scenario=scenario)

    def scenario_replay(self, scenario="target", rules=None):
        return replay_session(self.bars(scenario), calendar=cal(self.DAY, self.DAY), rules=rules)

    def test_01_nse_75_full_regular_session(self):
        self.assertEqual(len(validate_session(self.bars(), calendar=cal(self.DAY, self.DAY))), 75)

    def test_02_causal_fill_and_target(self):
        result = self.scenario_replay(rules=ResearchRules(cost_bps_each_side=D("0")))
        self.assertEqual(result.reason, "target_first")
        self.assertTrue(result.fill_at.endswith("09:40:00+05:30"))
        self.assertTrue(result.signal_at.endswith("09:30:00+05:30"))
        self.assertEqual(result.entry, D("103"))
        self.assertEqual(result.exit, D("105.06"))
        self.assertLessEqual(result.shares, 97)
        self.assertEqual(result.orders_submitted, 0)

    def test_03_intrabar_both_levels_stop_first(self):
        both = self.scenario_replay("both")
        stopped = self.scenario_replay("stop")
        self.assertEqual(both.reason, "stop_first_conservative")
        self.assertEqual(both.exit, stopped.exit)
        self.assertLess(both.net_pnl, 0)

    def test_04_no_closed_breakout_cannot_open_position(self):
        result = self.scenario_replay("no_breakout")
        self.assertEqual(result.reason, "no_closed_breakout")
        self.assertEqual(result.shares, 0)
        self.assertEqual(result.net_pnl, 0)
        self.assertIsNone(result.fill_at)

    def test_05_future_prices_do_not_change_past_decision(self):
        original = self.bars()
        changed = list(original)
        changed[60] = replace(changed[60], high=D("300"))
        a = replay_session(original, calendar=cal(self.DAY, self.DAY))
        b = replay_session(tuple(changed), calendar=cal(self.DAY, self.DAY))
        self.assertEqual(a.decision_hash, b.decision_hash)
        self.assertNotEqual(a.source_hash, b.source_hash)

    def test_06_missing_or_duplicate_bars_fail_closed(self):
        for idx in (0, 2, 4, 74):
            with self.subTest(index=idx), self.assertRaises(ResearchDataNotReady):
                replay_session(self.bars()[:idx]+self.bars()[idx+1:],
                               calendar=cal(self.DAY, self.DAY))
        changed = list(self.bars())
        changed[3] = changed[4]
        with self.assertRaises(ResearchDataNotReady):
            replay_session(tuple(changed), calendar=cal(self.DAY, self.DAY))

    def test_07_mixed_symbol_is_rejected(self):
        changed = list(self.bars())
        changed[50] = replace(changed[50], symbol="OTHER")
        with self.assertRaises(ResearchDataNotReady):
            replay_session(tuple(changed), calendar=cal(self.DAY, self.DAY))

    def test_08_holiday_uncovered_or_wrong_exchange_is_rejected(self):
        for calendar in (
            cal(self.DAY, self.DAY, holidays=(self.DAY,)),
            cal(self.DAY+dt.timedelta(days=1), self.DAY+dt.timedelta(days=1)),
            TradingCalendar("NSE"),
            TradingCalendar("NYSE", covered_from=self.DAY, covered_to=self.DAY),
        ):
            with self.subTest(calendar=calendar.name), self.assertRaises(ResearchDataNotReady):
                replay_session(self.bars(), calendar=calendar)

    def test_09_signal_received_after_fill_is_rejected(self):
        changed = list(self.bars())
        changed[3] = replace(changed[3], observed_at=dt.datetime(2026, 10, 6, 9, 41, tzinfo=IST))
        with self.assertRaises(ResearchDataNotReady):
            replay_session(tuple(changed), calendar=cal(self.DAY, self.DAY))

    def test_10_invalid_ohlc_timezone_volume_fail_closed(self):
        base = self.bars()[0]
        for update in (
            {"high": D("NaN")},
            {"low": D("200")},
            {"opened_at": base.opened_at.replace(tzinfo=None)},
            {"volume": -1},
            {"volume": True},
        ):
            with self.subTest(update=update), self.assertRaises(ResearchDataNotReady):
                replace(base, **update)

    def test_11_limits_enforced_and_loss_bounded_before_costs(self):
        rules = ResearchRules(starting_capital=D("100000"), max_position_notional=D("5000"),
                              risk_fraction=D("0.0002"), cost_bps_each_side=D("0"))
        result = self.scenario_replay("stop", rules)
        self.assertLessEqual(result.shares * result.entry, rules.max_position_notional)
        self.assertLessEqual((result.entry-result.stop)*result.shares,
                             rules.starting_capital*rules.risk_fraction)
        self.assertLess(result.net_pnl, 0)

    def test_12_bad_rules_and_bootstrap_trials_rejected(self):
        for change in ({"starting_capital": D("0")}, {"max_position_notional": D("200000")},
                       {"stop_fraction": D("-1")}, {"risk_fraction": D("0.2")},
                       {"cost_bps_each_side": D("NaN")}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                ResearchRules(**change)
        with self.assertRaises(ValueError):
            bootstrap_monte_carlo((), trials=100000)

    def test_13_only_synthetic_provenance_accepted(self):
        with self.assertRaises(ResearchDataNotReady):
            replace(self.bars()[0], source_kind="live_market")

    def make_outcomes(self):
        start, end = dt.date(2026, 10, 5), dt.date(2026, 10, 30)
        calendar = cal(start, end)
        days = calendar.sessions_in_range(start, end)
        scenarios = ("target", "stop", "no_breakout", "target", "both")
        return tuple(replay_session(fixture(day, scenario=scenarios[i % 5]), calendar=calendar)
                     for i, day in enumerate(days))

    def test_14_bootstrap_10000_seeded_no_future_claims(self):
        outcomes = self.make_outcomes()
        a = bootstrap_monte_carlo(outcomes, trials=10000, seed=19)
        b = bootstrap_monte_carlo(outcomes, trials=10000, seed=19)
        self.assertEqual(a, b)
        self.assertEqual(a["trials"], 10000)
        self.assertFalse(a["real_market_certified"])
        self.assertEqual(a["orders_submitted"], 0)
        self.assertTrue(0 <= a["positive_resample_fraction"] <= 1)

    def test_15_duplicate_or_real_trade_outcome_rejected(self):
        outcomes = self.make_outcomes()
        with self.assertRaises(ResearchDataNotReady):
            bootstrap_monte_carlo((outcomes[0],)*5)
        with self.assertRaises(ResearchDataNotReady):
            bootstrap_monte_carlo(outcomes[:-1]+(replace(outcomes[-1], orders_submitted=1),))

    def test_16_never_broker_executable(self):
        out = self.scenario_replay()
        self.assertEqual(out.data_class, "synthetic_fixture")
        self.assertEqual(out.orders_submitted, 0)


if __name__ == "__main__":
    unittest.main()