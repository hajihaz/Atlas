import unittest
from decimal import Decimal

from atlas.execution.simulator import DiscreteExecutionSimulator, ExecutionConfig


class DiscreteExecutionTests(unittest.TestCase):
    def test_target_weight_rounds_down_to_integer_shares(self):
        result = DiscreteExecutionSimulator(ExecutionConfig(fee_bps_per_side=Decimal("0"))).execute(
            starting_cash=Decimal("1000"),
            prices={"SPY": Decimal("143")},
            target_weights={"SPY": Decimal("0.625")},
        )
        self.assertEqual(result.intents[0].quantity, 4)

    def test_lean_default_free_buffer_is_applied(self):
        result = DiscreteExecutionSimulator(ExecutionConfig(fee_bps_per_side=Decimal("0"))).execute(
            starting_cash=Decimal("100000"),
            prices={"SPY": Decimal("143")},
            target_weights={"SPY": Decimal("0.625")},
        )
        self.assertEqual(result.intents[0].quantity, 435)

    def test_fee_is_charged_on_buy(self):
        result = DiscreteExecutionSimulator(
            ExecutionConfig(fee_bps_per_side=Decimal("10"))
        ).execute(
            starting_cash=Decimal("1000"),
            prices={"SPY": Decimal("100")},
            target_weights={"SPY": Decimal("0.5")},
        )
        self.assertEqual(result.fills[0].fee, Decimal("0.4"))

    def test_existing_holdings_generate_delta_order(self):
        result = DiscreteExecutionSimulator(ExecutionConfig(fee_bps_per_side=Decimal("0"))).execute(
            starting_cash=Decimal("1000"),
            prices={"SPY": Decimal("100")},
            target_weights={"SPY": Decimal("0.5")},
            existing_holdings={"SPY": 5},
        )
        self.assertEqual(result.intents[0].quantity, 2)

    def test_zero_target_liquidates_existing_position(self):
        result = DiscreteExecutionSimulator(ExecutionConfig(fee_bps_per_side=Decimal("0"))).execute(
            starting_cash=Decimal("0"),
            prices={"SPY": Decimal("100")},
            target_weights={"SPY": Decimal("0")},
            existing_holdings={"SPY": 5},
        )
        self.assertEqual(result.intents[0].quantity, -5)


if __name__ == "__main__":
    unittest.main()


class ExecutionHardeningTests(unittest.TestCase):
    def test_minimum_order_margin_suppresses_tiny_rebalance(self):
        result = DiscreteExecutionSimulator(
            ExecutionConfig(
                fee_bps_per_side=Decimal("0"), minimum_order_margin_percentage=Decimal("0.01")
            )
        ).execute(
            starting_cash=Decimal("1000"),
            prices={"SPY": Decimal("100")},
            target_weights={"SPY": Decimal("0.005")},
        )
        self.assertEqual(result.intents, ())

    def test_buying_power_never_creates_negative_cash(self):
        result = DiscreteExecutionSimulator(
            ExecutionConfig(fee_bps_per_side=Decimal("10"))
        ).execute(
            starting_cash=Decimal("100"),
            prices={"A": Decimal("60"), "B": Decimal("60")},
            target_weights={"A": Decimal("0.9"), "B": Decimal("0.9")},
        )
        self.assertGreaterEqual(result.ending_cash, Decimal("0"))

    def test_sells_execute_before_buys(self):
        result = DiscreteExecutionSimulator(ExecutionConfig(fee_bps_per_side=Decimal("0"))).execute(
            starting_cash=Decimal("0"),
            prices={"A": Decimal("100"), "B": Decimal("10")},
            target_weights={"A": Decimal("0"), "B": Decimal("0.5")},
            existing_holdings={"A": 10},
        )
        self.assertEqual([f.instrument_id for f in result.fills], ["A", "B"])
        self.assertGreater(result.holdings.get("B", 0), 0)

    def test_negative_weight_is_rejected(self):
        with self.assertRaises(ValueError):
            DiscreteExecutionSimulator().execute(
                starting_cash=Decimal("1000"),
                prices={"A": Decimal("10")},
                target_weights={"A": Decimal("-0.1")},
            )
