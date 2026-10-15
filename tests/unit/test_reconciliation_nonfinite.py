from decimal import Decimal

import pytest

from atlas.reporting.reconcile import reconcile


@pytest.mark.parametrize(
    "field",
    [
        "atlas_cash",
        "broker_cash",
        "atlas_equity",
        "broker_equity",
        "atlas_fees",
        "broker_fees",
        "tolerance",
    ],
)
@pytest.mark.parametrize("bad", ["NaN", "Infinity", "-Infinity"])
def test_invalid_monetary_observation_blocks_reconciliation(field, bad):
    values = {
        "atlas_cash": Decimal("100"),
        "broker_cash": Decimal("100"),
        "atlas_positions": {"A": 1},
        "broker_positions": {"A": 1},
        "atlas_equity": Decimal("110"),
        "broker_equity": Decimal("110"),
        "atlas_fees": Decimal("1"),
        "broker_fees": Decimal("1"),
        "tolerance": Decimal("0.01"),
    }
    values[field] = Decimal(bad)
    verdict = reconcile(**values)
    assert not verdict.matched
    assert "non_finite_account_observation" in verdict.reasons


def test_negative_tolerance_is_invalid():
    with pytest.raises(ValueError):
        reconcile(
            atlas_cash=Decimal("100"),
            broker_cash=Decimal("100"),
            atlas_positions={},
            broker_positions={},
            tolerance=Decimal("-1"),
        )


def test_fractional_holdings_cannot_masquerade_as_valid_integer_position():
    verdict = reconcile(
        atlas_cash=Decimal("100"),
        broker_cash=Decimal("100"),
        atlas_positions={"A": Decimal("1.5")},
        broker_positions={"A": Decimal("1.5")},
    )
    assert not verdict.matched
    assert "invalid_position_observation" in verdict.reasons
