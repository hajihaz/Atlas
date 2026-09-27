import unittest
from decimal import Decimal

from atlas.execution.simulator import DiscreteExecutionSimulator, ExecutionConfig


class LeanGoldenReconciliationTests(unittest.TestCase):
    def test_spy_order_intent_matches_lean(self):
        result = DiscreteExecutionSimulator(
            ExecutionConfig(fee_bps_per_side=Decimal("0.3487421985973654"))
        ).execute(
            starting_cash=Decimal("100000"),
            prices={"SPY": Decimal("143.1562")},
            target_weights={"SPY": Decimal("0.625")},
            fill_prices={"SPY": Decimal("143.372382812")},
        )
        self.assertEqual(result.intents[0].quantity, 435)
        self.assertEqual(result.fills[0].fill_price, Decimal("143.372382812"))
        self.assertAlmostEqual(float(result.fills[0].fee), 2.175, places=6)
        self.assertEqual(result.holdings["SPY"], 435)

    def test_spy_equity_matches_lean_fixture(self):
        result = DiscreteExecutionSimulator(
            ExecutionConfig(fee_bps_per_side=Decimal("0.3487421985973654"))
        ).execute(
            starting_cash=Decimal("100000"),
            prices={"SPY": Decimal("143.1562")},
            target_weights={"SPY": Decimal("0.625")},
            fill_prices={"SPY": Decimal("143.372382812")},
            valuation_prices={"SPY": Decimal("146.3294")},
        )
        self.assertAlmostEqual(float(result.equity), 101284.13, places=2)


if __name__ == "__main__":
    unittest.main()
