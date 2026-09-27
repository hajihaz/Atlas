import datetime as dt
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from atlas.execution.ledger import ExecutionEvent, ExecutionLedger
from atlas.execution.simulator import Fill
from atlas.paper.persistence import DurablePaperAccountStore
from atlas.portfolio.account import PortfolioAccount


class PaperPersistenceTests(unittest.TestCase):
    def test_account_round_trip_reconciles_to_ledger(self):
        with tempfile.TemporaryDirectory() as tmp:
            account = PortfolioAccount(cash=Decimal("100"))
            account.apply_fill(
                Fill("A", 2, Decimal("10"), Decimal("0")),
                event_id="fill-1",
                valuation_prices={"A": Decimal("11")},
            )
            ledger = ExecutionLedger()
            ledger.append(ExecutionEvent("fill-1", "fill", dt.datetime.now(dt.UTC)))
            store = DurablePaperAccountStore(Path(tmp) / "account.json")
            store.save(account, ledger)
            restored = store.load(ledger=ledger, valuation_prices={"A": Decimal("11")})
            self.assertEqual(restored.state, account.state)

    def test_wrong_ledger_checkpoint_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            account = PortfolioAccount(cash=Decimal("100"))
            ledger = ExecutionLedger()
            store = DurablePaperAccountStore(Path(tmp) / "account.json")
            store.save(account, ledger)
            ledger.append(ExecutionEvent("later", "decision", dt.datetime.now(dt.UTC)))
            with self.assertRaises(RuntimeError):
                store.load(ledger=ledger, valuation_prices={})
