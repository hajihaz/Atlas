import unittest
from decimal import Decimal

from atlas.broker.accounting_reconcile import AccountSnapshot, BrokerAccountingReconciler
from atlas.broker.adapter import BrokerFill
from atlas.execution.ledger import ExecutionLedger
from atlas.portfolio.account import PortfolioAccount


class T(unittest.TestCase):
    def test_trade_updates_account_once(self):
        a = PortfolioAccount(cash=Decimal("10000"))
        r = BrokerAccountingReconciler(a, ExecutionLedger())
        f = BrokerFill("o", "X", 10, Decimal("100"), Decimal("1"))
        r.apply_fill(f, trade_id="t1", side="BUY", valuation_prices={"X": Decimal("100")})
        r.apply_fill(f, trade_id="t1", side="BUY", valuation_prices={"X": Decimal("100")})
        self.assertEqual(a.state.holdings["X"], 10)
        self.assertEqual(len(a.transitions()), 1)

    def test_reconciliation_fail_closed(self):
        a = PortfolioAccount(cash=Decimal("10000"))
        r = BrokerAccountingReconciler(a, ExecutionLedger())
        ok, reasons = r.reconcile(AccountSnapshot(Decimal("9999"), {}, Decimal("9999")))
        self.assertFalse(ok)
        self.assertEqual(set(reasons), {"cash_mismatch", "equity_mismatch"})

    def test_sell_is_signed(self):
        a = PortfolioAccount(cash=Decimal("10000"), holdings={"X": 10})
        r = BrokerAccountingReconciler(a, ExecutionLedger())
        f = BrokerFill("o", "X", 4, Decimal("100"), Decimal("1"))
        r.apply_fill(f, trade_id="t2", side="SELL", valuation_prices={"X": Decimal("100")})
        self.assertEqual(a.state.holdings["X"], 6)


class DurableBrokerAccountingTests(unittest.TestCase):
    def test_duplicate_trade_is_suppressed_after_reconciler_restart(self):
        import tempfile
        from pathlib import Path

        from atlas.operations_hardening import AppliedEventStore

        with tempfile.TemporaryDirectory() as tmp:
            account = PortfolioAccount(cash=Decimal("100"))
            ledger = ExecutionLedger()
            store = AppliedEventStore(Path(tmp) / "applied.json")
            first = BrokerAccountingReconciler(account, ledger, store)
            fill = BrokerFill("broker-1", "A", 1, Decimal("10"), Decimal("0"))
            self.assertIsNotNone(
                first.apply_fill(
                    fill, trade_id="trade-1", side="BUY", valuation_prices={"A": Decimal("10")}
                )
            )
            restarted = BrokerAccountingReconciler(account, ledger, store)
            self.assertIsNone(
                restarted.apply_fill(
                    fill, trade_id="trade-1", side="BUY", valuation_prices={"A": Decimal("10")}
                )
            )
