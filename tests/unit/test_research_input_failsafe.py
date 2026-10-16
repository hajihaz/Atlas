"""Research inputs must fail closed rather than manufacture performance."""

import datetime as dt
from decimal import Decimal

import pytest

from atlas.backtest.costs import CostModel
from atlas.common.types import CorporateActionType
from atlas.data.adjustments import CorporateAction, cumulative_price_factor, price_factor


@pytest.mark.parametrize("bps", [-0.01, float("nan"), float("inf"), float("-inf")])
def test_invalid_transaction_cost_rate_rejected(bps: float) -> None:
    with pytest.raises(ValueError, match="transaction cost"):
        CostModel(bps)


@pytest.mark.parametrize("turnover", [-0.1, float("nan"), float("inf")])
def test_invalid_turnover_does_not_improve_backtest_return(turnover: float) -> None:
    with pytest.raises(ValueError, match="turnover"):
        CostModel(10).cost(turnover)


def test_transaction_cost_overflow_fails_closed() -> None:
    with pytest.raises(ValueError, match="overflow"):
        CostModel(1e308).cost(1e308)


@pytest.mark.parametrize(
    ("kind", "terms"),
    [
        (CorporateActionType.SPLIT, {"old": "1", "new": "0"}),
        (CorporateActionType.SPLIT, {"old": "NaN", "new": "5"}),
        (CorporateActionType.SPLIT, {"old": "1", "new": "-3"}),
        (CorporateActionType.SPLIT, {"old": "1", "new": "oops"}),
        (CorporateActionType.BONUS, {"held": "0", "bonus": "1"}),
        (CorporateActionType.BONUS, {"held": "1", "bonus": "-1"}),
        (CorporateActionType.BONUS, {"held": "1", "bonus": "Infinity"}),
        (CorporateActionType.DIVIDEND, {"amount": "-1"}),
        (CorporateActionType.DIVIDEND, {"amount": "100"}),
        (CorporateActionType.DIVIDEND, {"amount": "101"}),
        (CorporateActionType.DIVIDEND, {"amount": "NaN"}),
    ],
)
def test_invalid_corporate_action_must_not_create_false_returns(
    kind: CorporateActionType, terms: dict[str, str]
) -> None:
    action = CorporateAction("SPY", kind, dt.date(2025, 1, 2), terms)
    with pytest.raises(ValueError):
        price_factor(action, ref_close=Decimal("100"))


def test_unreliable_dividend_reference_is_rejected() -> None:
    action = CorporateAction(
        "SPY", CorporateActionType.DIVIDEND, dt.date(2025, 1, 2), {"amount": "5"}
    )
    for invalid in (Decimal("NaN"), Decimal("Infinity"), Decimal("-1"), Decimal("0")):
        with pytest.raises(ValueError):
            price_factor(action, ref_close=invalid)
    assert price_factor(action, ref_close=Decimal("100")) == Decimal("0.95")


def test_adjustment_does_not_use_future_action_before_ex_date() -> None:
    action = CorporateAction(
        "SPY", CorporateActionType.SPLIT, dt.date(2025, 1, 2), {"old": "1", "new": "2"}
    )
    assert cumulative_price_factor([action], dt.date(2025, 1, 1)) == Decimal("0.5")
    assert cumulative_price_factor([action], dt.date(2025, 1, 2)) == Decimal("1")
