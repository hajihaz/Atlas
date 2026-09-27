import unittest
from decimal import Decimal

from atlas.risk.gate import RiskGate, RiskLimits


class ExtendedRiskTests(unittest.TestCase):
    def test_turnover_limit_vetoes(self):
        gate = RiskGate(RiskLimits(max_turnover=Decimal("0.1")))
        result = gate.evaluate(
            {"A": Decimal("0.2")},
            equity=Decimal("100"),
            current_weights={"A": Decimal("0")},
        )
        self.assertFalse(result.approved)
        self.assertIn("turnover_limit", result.reasons)

    def test_drawdown_limit_vetoes(self):
        gate = RiskGate(RiskLimits(max_drawdown=Decimal("0.1")))
        result = gate.evaluate({}, equity=Decimal("80"), peak_equity=Decimal("100"))
        self.assertFalse(result.approved)
        self.assertIn("drawdown_limit", result.reasons)

    def test_position_count_limit_vetoes(self):
        gate = RiskGate(RiskLimits(max_positions=1))
        result = gate.evaluate({"A": Decimal("0.1"), "B": Decimal("0.1")}, equity=Decimal("100"))
        self.assertFalse(result.approved)
        self.assertIn("position_count_limit", result.reasons)
