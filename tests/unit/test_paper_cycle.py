import unittest
from decimal import Decimal

from atlas.execution.ledger import ExecutionLedger
from atlas.paper.broker_simulator import DeterministicPaperBroker
from atlas.paper.cycle import PaperCycle
from atlas.portfolio.account import PortfolioAccount
from atlas.risk.gate import RiskGate, RiskLimits


class PaperCycleTests(unittest.TestCase):
    def setUp(self):
        self.account = PortfolioAccount(cash=Decimal("100000"))
        self.broker = DeterministicPaperBroker({"AAA": Decimal("100")})
        self.risk = RiskGate(RiskLimits(max_single_weight=Decimal("0.5")))
        self.cycle = PaperCycle(self.account, self.risk, self.broker, ExecutionLedger())

    def test_end_to_end_cycle_reconciles(self):
        result = self.cycle.run(
            {"AAA": Decimal("0.5")},
            valuation_prices={"AAA": Decimal("100")},
            approval_id="paper-approval",
        )
        self.assertTrue(result.reconciliation_ok)
        self.assertEqual(result.fills, 1)
        self.assertEqual(self.account.state.holdings["AAA"], 500)

    def test_risk_reduction_is_applied_before_order_creation(self):
        result = self.cycle.run(
            {"AAA": Decimal("0.9")},
            valuation_prices={"AAA": Decimal("100")},
            approval_id="paper-approval",
        )
        self.assertEqual(result.orders[0].quantity, 500)

    def test_missing_broker_fill_cannot_be_silently_accepted(self):
        class BadBroker(DeterministicPaperBroker):
            def reconcile(self):
                from atlas.broker.adapter import BrokerFill

                return (BrokerFill("unknown", "AAA", 1, Decimal("100"), Decimal("0")),)

        cycle = PaperCycle(
            self.account, self.risk, BadBroker({"AAA": Decimal("100")}), ExecutionLedger()
        )
        with self.assertRaises(RuntimeError):
            cycle.run(
                {"AAA": Decimal("0.1")}, valuation_prices={"AAA": Decimal("100")}, approval_id="a"
            )


if __name__ == "__main__":
    unittest.main()


class PaperCycleReplayTests(unittest.TestCase):
    def test_replayed_broker_fill_is_not_double_accounted(self):
        account = PortfolioAccount(cash=Decimal("100000"))
        broker = DeterministicPaperBroker({"AAA": Decimal("100")})
        cycle = PaperCycle(
            account,
            RiskGate(RiskLimits(max_single_weight=Decimal("0.5"))),
            broker,
            ExecutionLedger(),
        )
        first = cycle.run(
            {"AAA": Decimal("0.5")}, valuation_prices={"AAA": Decimal("100")}, approval_id="a"
        )
        second = cycle.run(
            {"AAA": Decimal("0.5")}, valuation_prices={"AAA": Decimal("100")}, approval_id="a"
        )
        self.assertTrue(first.reconciliation_ok)
        self.assertTrue(second.reconciliation_ok)
        self.assertEqual(account.state.holdings["AAA"], 500)


if __name__ == "__main__":
    unittest.main()
