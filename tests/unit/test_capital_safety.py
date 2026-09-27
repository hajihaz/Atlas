import datetime as dt
import unittest
from decimal import Decimal

from atlas.execution import compare_equity
from atlas.governance import GovernanceState, TradingMode
from atlas.market import MarketDataBoundary, MarketDataStatus
from atlas.reporting import reconcile
from atlas.risk import RiskGate, RiskLimits


class CapitalSafetyTests(unittest.TestCase):
    def test_risk_vetoes_limits_stale_data_and_kill(self):
        gate = RiskGate(RiskLimits(max_gross=Decimal("1"), max_single_weight=Decimal("0.6")))
        self.assertTrue(
            gate.evaluate({"SPY": Decimal("0.5")}, equity=Decimal("100"), data_fresh=True).approved
        )
        reduced = gate.evaluate({"SPY": Decimal("0.7")}, equity=Decimal("100"))
        self.assertTrue(reduced.approved)
        self.assertTrue(reduced.reduced)
        self.assertEqual(reduced.target_weights["SPY"], Decimal("0.6"))
        self.assertFalse(
            gate.evaluate({"SPY": Decimal("0.5")}, equity=Decimal("100"), data_fresh=False).approved
        )
        self.assertFalse(
            gate.evaluate({"SPY": Decimal("0.5")}, equity=Decimal("100"), kill_switch=True).approved
        )

    def test_market_data_fails_closed(self):
        now = dt.datetime(2026, 9, 3, tzinfo=dt.UTC)
        status = MarketDataStatus("s1", now, now, dt.timedelta(minutes=5))
        MarketDataBoundary().admit(status)
        stale = MarketDataStatus("s2", now, now - dt.timedelta(minutes=6), dt.timedelta(minutes=5))
        with self.assertRaises(ValueError):
            MarketDataBoundary().admit(stale)

    def test_governance_requires_all_gates(self):
        s = GovernanceState(TradingMode.LIVE, True, True, False)
        self.assertTrue(s.can_execute())
        self.assertFalse(GovernanceState(TradingMode.LIVE, True, False, False).can_execute())
        self.assertFalse(GovernanceState(TradingMode.RESEARCH, True, True, False).can_execute())
        self.assertFalse(GovernanceState(TradingMode.LIVE, True, True, True).can_execute())

    def test_reconciliation_is_fail_closed(self):
        self.assertTrue(
            reconcile(
                atlas_cash=Decimal("100"),
                broker_cash=Decimal("100"),
                atlas_positions={"SPY": 1},
                broker_positions={"SPY": 1},
            ).matched
        )
        self.assertFalse(
            reconcile(
                atlas_cash=Decimal("100"),
                broker_cash=Decimal("99"),
                atlas_positions={"SPY": 1},
                broker_positions={"SPY": 1},
            ).matched
        )
        self.assertTrue(compare_equity(Decimal("101.004"), Decimal("101.00")))


if __name__ == "__main__":
    unittest.main()
