import unittest
from decimal import Decimal

from atlas.reporting.reconcile import reconcile


class ExtendedReconciliationTests(unittest.TestCase):
    def test_equity_and_fee_mismatch_fail_closed(self):
        result = reconcile(
            atlas_cash=Decimal("10"),
            broker_cash=Decimal("10"),
            atlas_positions={},
            broker_positions={},
            atlas_equity=Decimal("100"),
            broker_equity=Decimal("99"),
            atlas_fees=Decimal("1"),
            broker_fees=Decimal("2"),
        )
        self.assertFalse(result.matched)
        self.assertIn("equity_mismatch", result.reasons)
        self.assertIn("fee_mismatch", result.reasons)

    def test_one_sided_optional_observation_fails_closed(self):
        result = reconcile(
            atlas_cash=Decimal("10"),
            broker_cash=Decimal("10"),
            atlas_positions={},
            broker_positions={},
            atlas_equity=Decimal("10"),
        )
        self.assertIn("equity_observation_incomplete", result.reasons)
