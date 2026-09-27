"""Hardening tests for Steps 22-28: accounting, risk, data, paper and promotion."""

import datetime as dt
import unittest
from decimal import Decimal

from atlas.execution.reconcile import compare_equity, compare_fills, compare_order_intents
from atlas.execution.simulator import ExecutionConfig, Fill, OrderIntent
from atlas.market import MarketDataBoundary, MarketDataStatus
from atlas.paper import PaperConfig, PaperRuntime
from atlas.portfolio import PortfolioAccount
from atlas.research.gates import GateVerdict
from atlas.research.promotion import PaperEvidence, evaluate_paper_promotion
from atlas.risk import RiskGate, RiskLimits


class Steps22To28Tests(unittest.TestCase):
    def test_portfolio_accounting_transition_is_authoritative(self):
        account = PortfolioAccount(cash=Decimal("1000"))
        transition = account.apply_fill(
            Fill("SPY", 5, Decimal("100"), Decimal("1")),
            event_id="fill-1",
            valuation_prices={"SPY": Decimal("105")},
        )
        self.assertEqual(transition.cash_after, Decimal("499"))
        self.assertEqual(account.state.holdings["SPY"], 5)
        self.assertEqual(account.state.equity, Decimal("1024"))
        self.assertEqual(len(account.transitions()), 1)

    def test_portfolio_rejects_short_and_negative_cash(self):
        account = PortfolioAccount(cash=Decimal("100"), holdings={"SPY": 1})
        with self.assertRaises(ValueError):
            account.apply_fill(
                Fill("SPY", -2, Decimal("100"), Decimal("0")),
                event_id="bad",
                valuation_prices={"SPY": Decimal("100")},
            )
        with self.assertRaises(ValueError):
            PortfolioAccount(cash=Decimal("-1"))

    def test_risk_can_reduce_but_never_increase(self):
        gate = RiskGate(RiskLimits(max_gross=Decimal("0.8"), max_single_weight=Decimal("0.5")))
        decision = gate.evaluate({"A": Decimal("0.7"), "B": Decimal("0.7")}, equity=Decimal("100"))
        self.assertTrue(decision.approved)
        self.assertTrue(decision.reduced)
        self.assertLessEqual(sum(decision.target_weights.values()), Decimal("0.8"))
        self.assertLessEqual(decision.target_weights["A"], Decimal("0.7"))
        self.assertFalse(
            gate.evaluate({"A": Decimal("0.2")}, equity=Decimal("100"), data_fresh=False).approved
        )

    def test_market_boundary_rejects_future_and_stale(self):
        now = dt.datetime(2026, 9, 3, 12, tzinfo=dt.UTC)
        b = MarketDataBoundary()
        b.admit(MarketDataStatus("s", now, now, dt.timedelta(minutes=1)))
        with self.assertRaises(ValueError):
            b.admit(
                MarketDataStatus("s", now, now + dt.timedelta(seconds=1), dt.timedelta(minutes=1))
            )
        with self.assertRaises(ValueError):
            b.admit(
                MarketDataStatus("s", now, now - dt.timedelta(minutes=2), dt.timedelta(minutes=1))
            )

    def test_paper_runtime_persists_account_and_ledger_across_sessions(self):
        rt = PaperRuntime(
            PaperConfig(enabled=True, execution=ExecutionConfig(fee_bps_per_side=Decimal("0")))
        )
        rt.simulate(
            cash=Decimal("10000"),
            prices={"SPY": Decimal("100")},
            targets={"SPY": Decimal("0.2")},
            fill_prices={"SPY": Decimal("100")},
            valuation_prices={"SPY": Decimal("101")},
            session_id="s1",
        )
        first = rt.snapshot("s1")
        rt.simulate(
            cash=Decimal("10000"),
            prices={"SPY": Decimal("101")},
            targets={"SPY": Decimal("0.2")},
            fill_prices={"SPY": Decimal("101")},
            valuation_prices={"SPY": Decimal("102")},
            session_id="s2",
        )
        second = rt.snapshot("s2")
        self.assertGreater(second.ledger_checkpoint[0], first.ledger_checkpoint[0])
        self.assertEqual(second.holdings, first.holdings)

    def test_paper_kill_switch_and_disabled_state_are_terminal(self):
        args = dict(
            cash=Decimal("10000"),
            prices={"SPY": Decimal("100")},
            targets={"SPY": Decimal("0.2")},
            fill_prices={"SPY": Decimal("100")},
            valuation_prices={"SPY": Decimal("100")},
        )
        with self.assertRaises(RuntimeError):
            PaperRuntime().simulate(**args)
        with self.assertRaises(RuntimeError):
            PaperRuntime(PaperConfig(enabled=True)).simulate(**args, kill_switch=True)

    def test_cross_engine_order_fill_and_equity_comparison(self):
        oi = OrderIntent("SPY", 10, Decimal("100"), Decimal("0.2"))
        self.assertEqual(compare_order_intents([oi], [oi]), (True, ()))
        fill = Fill("SPY", 10, Decimal("101"), Decimal("0.10"))
        self.assertEqual(compare_fills([fill], [fill]), (True, ()))
        self.assertTrue(compare_equity(Decimal("101.004"), Decimal("101.00")))
        self.assertFalse(compare_equity(Decimal("101.02"), Decimal("101.00")))

    def test_research_to_paper_promotion_requires_all_evidence(self):
        valid = GateVerdict(True, {"all": True}, ())
        evidence = PaperEvidence(30, "result", "ledger", True)
        self.assertTrue(evaluate_paper_promotion(valid, evidence).passed)
        bad = PaperEvidence(29, "result", "ledger", True)
        self.assertFalse(evaluate_paper_promotion(valid, bad).passed)
        invalid = GateVerdict(False, {"all": False}, ("failed",))
        self.assertFalse(evaluate_paper_promotion(invalid, evidence).passed)


if __name__ == "__main__":
    unittest.main()
