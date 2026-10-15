from dataclasses import replace
from decimal import Decimal

import pytest

from atlas.risk.gate import RiskGate, RiskLimits


@pytest.mark.parametrize("bad", [Decimal("NaN"), Decimal("Infinity"), Decimal("-Infinity")])
@pytest.mark.parametrize(
    "field", ["max_gross", "max_single_weight", "min_equity", "max_turnover", "max_drawdown"]
)
def test_nonfinite_risk_limits_never_instantiate_gate(field, bad):
    with pytest.raises(ValueError, match="risk limits"):
        RiskGate(replace(RiskLimits(), **{field: bad}))


def test_illegal_drawdown_and_position_limits_block_config():
    with pytest.raises(ValueError, match="risk limits"):
        RiskGate(RiskLimits(max_drawdown=Decimal("1.5")))
    with pytest.raises(ValueError, match="risk limits"):
        RiskGate(RiskLimits(max_positions=True))
