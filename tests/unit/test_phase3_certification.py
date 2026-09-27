import datetime as dt
import unittest
from decimal import Decimal

from atlas.backtest import run_backtest
from atlas.backtest.costs import CostModel
from atlas.broker.adapter import ApprovedOrder
from atlas.data.market.records import OHLCVBar
from atlas.execution.ledger import ExecutionLedger
from atlas.governance.control import GovernanceState, TradingMode
from atlas.market.boundary import MarketDataBoundary, MarketDataStatus
from atlas.paper.runtime import PaperRuntime
from atlas.portfolio.account import PortfolioState
from atlas.reporting.reconcile import reconcile
from atlas.research.dataview import InMemoryBarSource
from atlas.research.synthetic import sessions, unbounded_calendar
from atlas.risk.gate import RiskGate, RiskLimits
from atlas.strategy import Strategy, StrategySpec


class Fixed(Strategy):
    def __init__(self):
        super().__init__(StrategySpec("certification_fixed", "1"))

    def target_weights(self, view):
        return {"SPY": 0.20}


class Phase3CertificationTests(unittest.TestCase):
    def setUp(self):
        self.cal = unbounded_calendar()
        ds = sessions(self.cal, dt.date(2024, 1, 2), dt.date(2024, 1, 5))
        self.src = InMemoryBarSource(
            {
                "SPY": [
                    OHLCVBar(
                        "SPY",
                        ds[0],
                        Decimal("100"),
                        Decimal("101"),
                        Decimal("99"),
                        Decimal("100"),
                        100,
                        "fixture",
                    ),
                    OHLCVBar(
                        "SPY",
                        ds[1],
                        Decimal("110"),
                        Decimal("112"),
                        Decimal("109"),
                        Decimal("111"),
                        100,
                        "fixture",
                    ),
                    OHLCVBar(
                        "SPY",
                        ds[2],
                        Decimal("120"),
                        Decimal("121"),
                        Decimal("119"),
                        Decimal("120"),
                        100,
                        "fixture",
                    ),
                    OHLCVBar(
                        "SPY",
                        ds[3],
                        Decimal("130"),
                        Decimal("131"),
                        Decimal("129"),
                        Decimal("130"),
                        100,
                        "fixture",
                    ),
                ]
            }
        )
        self.ds = ds

    def test_end_to_end_discrete_path_is_deterministic(self):
        kw = dict(
            start=self.ds[1],
            end=self.ds[3],
            calendar=self.cal,
            execution_mode="discrete",
            cost_model=CostModel(999),
        )
        a, b = run_backtest(Fixed(), self.src, **kw), run_backtest(Fixed(), self.src, **kw)
        self.assertEqual(a.result_hash(), b.result_hash())
        self.assertEqual(a.meta["execution_mode"], "discrete")
        self.assertTrue(all(x > 0 for x in a.equity))

    def test_risk_market_governance_and_reconciliation_fail_closed(self):
        risk = RiskGate(RiskLimits(max_gross=Decimal("1"), max_single_weight=Decimal("0.25")))
        self.assertTrue(risk.evaluate({"SPY": Decimal("0.20")}, equity=Decimal("100000")).approved)
        self.assertFalse(
            risk.evaluate(
                {"SPY": Decimal("0.20")}, equity=Decimal("100000"), kill_switch=True
            ).approved
        )
        now = dt.datetime(2026, 9, 3, tzinfo=dt.UTC)
        MarketDataBoundary().admit(MarketDataStatus("snap", now, now, dt.timedelta(minutes=1)))
        self.assertFalse(GovernanceState().can_execute())
        self.assertFalse(GovernanceState(TradingMode.LIVE, True, True, True).can_execute())
        ok = reconcile(
            atlas_cash=Decimal("100"),
            broker_cash=Decimal("100"),
            atlas_positions={"SPY": 1},
            broker_positions={"SPY": 1},
        )
        bad = reconcile(
            atlas_cash=Decimal("100"),
            broker_cash=Decimal("99"),
            atlas_positions={"SPY": 1},
            broker_positions={"SPY": 2},
        )
        self.assertTrue(ok.matched)
        self.assertFalse(bad.matched)

    def test_paper_disabled_and_live_governance_are_safe(self):
        with self.assertRaises(RuntimeError):
            PaperRuntime().simulate(
                cash=Decimal("100000"),
                prices={"SPY": Decimal("100")},
                targets={"SPY": Decimal("0.2")},
                fill_prices={"SPY": Decimal("100")},
                valuation_prices={"SPY": Decimal("101")},
            )
        self.assertEqual(ApprovedOrder("SPY", 1).approval_id, "")
        self.assertEqual(
            PortfolioState(Decimal("100"), {"SPY": 1}, Decimal("200")).position_value(
                {"SPY": Decimal("100")}
            ),
            Decimal("200"),
        )

    def test_execution_ledger_integrity_is_part_of_certification(self):
        ledger = ExecutionLedger()
        t = dt.datetime(2026, 9, 3, tzinfo=dt.UTC)
        ledger.append(
            __import__("atlas.execution.ledger", fromlist=["ExecutionEvent"]).ExecutionEvent(
                "d", "decision", t
            )
        )
        ledger.verify_integrity()


if __name__ == "__main__":
    unittest.main()
