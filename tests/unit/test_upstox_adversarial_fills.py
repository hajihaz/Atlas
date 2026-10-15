from dataclasses import replace
from decimal import Decimal

import pytest

from atlas.broker.adapter import OrderSide
from atlas.broker.upstox_reconcile import (
    ProviderTrade,
    apply_provider_trades_to_account,
    deduplicate_trades,
    parse_trade,
)
from atlas.portfolio.account import PortfolioAccount


@pytest.mark.parametrize("bad", ["NaN", "Infinity", "-Infinity", "-1", "0"])
def test_invalid_provider_fill_price_is_rejected(bad):
    raw = {
        "trade_id": "t1",
        "order_id": "o1",
        "instrument_token": "A",
        "quantity": 1,
        "average_price": bad,
        "fees": "0",
        "transaction_type": "BUY",
    }
    assert parse_trade(raw) is None


@pytest.mark.parametrize("bad", ["NaN", "Infinity", "-Infinity", "-1"])
def test_invalid_provider_fee_is_rejected(bad):
    raw = {
        "trade_id": "t1",
        "order_id": "o1",
        "instrument_token": "A",
        "quantity": 1,
        "average_price": "10",
        "fees": bad,
        "transaction_type": "BUY",
    }
    assert parse_trade(raw) is None


def test_conflicting_trade_id_with_different_fill_is_rejected():
    trade = ProviderTrade("t1", "o1", "A", 1, Decimal("10"), Decimal("0"), OrderSide.BUY)
    assert deduplicate_trades([trade, trade]) == (trade,)
    with pytest.raises(RuntimeError, match="conflicting broker trade"):
        deduplicate_trades([trade, replace(trade, fill_price=Decimal("11"))])


def test_existing_applied_trade_must_match_repeated_observation():
    account = PortfolioAccount(cash=Decimal("100"))
    trade = ProviderTrade("t1", "o1", "A", 1, Decimal("10"), Decimal("0"), OrderSide.BUY)
    first = apply_provider_trades_to_account(
        account, [trade], valuation_prices={"A": Decimal("10")}
    )
    assert len(first) == 1
    assert (
        apply_provider_trades_to_account(account, [trade], valuation_prices={"A": Decimal("10")})
        == ()
    )
    with pytest.raises(RuntimeError, match="conflicting persisted broker"):
        apply_provider_trades_to_account(
            account,
            [replace(trade, fee=Decimal("1"))],
            valuation_prices={"A": Decimal("10")},
        )


def test_forged_noninteger_or_boolean_quantity_does_not_parse():
    raw = {
        "trade_id": "t1",
        "order_id": "o1",
        "instrument_token": "A",
        "quantity": True,
        "average_price": "10",
        "transaction_type": "BUY",
    }
    assert parse_trade(raw) is None
    raw["quantity"] = "1.5"
    assert parse_trade(raw) is None


def test_invalid_later_trade_does_not_partially_apply_batch():
    account = PortfolioAccount(cash=Decimal("100"))
    good = ProviderTrade("t1", "o1", "A", 1, Decimal("10"), Decimal("0"), OrderSide.BUY)
    bad = ProviderTrade("t2", "o2", "A", 30, Decimal("10"), Decimal("0"), OrderSide.BUY)
    with pytest.raises(ValueError, match="negative cash"):
        apply_provider_trades_to_account(
            account, [good, bad], valuation_prices={"A": Decimal("10")}
        )
    assert account.state.cash == Decimal("100")
    assert account.transitions() == ()
    assert account.state.holdings == {}


def test_conflicting_later_trade_does_not_partially_apply_batch():
    account = PortfolioAccount(cash=Decimal("100"))
    good = ProviderTrade("t1", "o1", "A", 1, Decimal("10"), Decimal("0"), OrderSide.BUY)
    forged = replace(good, fill_price=Decimal("11"))
    with pytest.raises(RuntimeError, match="conflicting broker"):
        apply_provider_trades_to_account(
            account, [good, forged], valuation_prices={"A": Decimal("10")}
        )
    assert account.transitions() == ()
    assert account.state.cash == Decimal("100")
