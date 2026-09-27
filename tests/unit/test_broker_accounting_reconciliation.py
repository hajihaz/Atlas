import unittest
from decimal import Decimal

from atlas.broker.adapter import OrderSide
from atlas.broker.upstox_reconcile import ProviderTrade, apply_provider_trades_to_account
from atlas.portfolio.account import PortfolioAccount


class BrokerAccountingReconciliationTests(unittest.TestCase):
    def test_trade_updates_account_once(self):
        account = PortfolioAccount(cash=Decimal("10000"))
        trade = ProviderTrade(
            "t1", "o1", "NSE_EQ|X", 10, Decimal("100"), Decimal("1"), OrderSide.BUY
        )
        first = apply_provider_trades_to_account(
            account, [trade], valuation_prices={"NSE_EQ|X": Decimal("101")}
        )
        second = apply_provider_trades_to_account(
            account, [trade, trade], valuation_prices={"NSE_EQ|X": Decimal("101")}
        )
        self.assertEqual(len(first), 1)
        self.assertEqual(len(second), 0)
        self.assertEqual(account.state.holdings["NSE_EQ|X"], 10)
        self.assertEqual(account.state.cash, Decimal("8999"))

    def test_sell_trade_is_signed_for_portfolio(self):
        account = PortfolioAccount(cash=Decimal("10000"), holdings={"NSE_EQ|X": 10})
        trade = ProviderTrade(
            "t2", "o2", "NSE_EQ|X", 4, Decimal("110"), Decimal("1"), OrderSide.SELL
        )
        transitions = apply_provider_trades_to_account(
            account, [trade], valuation_prices={"NSE_EQ|X": Decimal("110")}
        )
        self.assertEqual(len(transitions), 1)
        self.assertEqual(account.state.holdings["NSE_EQ|X"], 6)
        self.assertEqual(account.state.cash, Decimal("10439"))


if __name__ == "__main__":
    unittest.main()
