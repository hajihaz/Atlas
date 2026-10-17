import datetime as dt
import sqlite3
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from atlas.broker.adapter import BrokerFill
from atlas.common.hashing import GENESIS_HASH, content_hash
from atlas.execution.journal import TransactionalExecutionJournal
from atlas.execution.ledger import ExecutionEvent, ExecutionLedger
from atlas.portfolio.account import PortfolioAccount


class TransactionalJournalTests(unittest.TestCase):
    def test_fill_account_ledger_and_idempotency_recover_together(self):
        with tempfile.TemporaryDirectory() as tmp:
            journal = TransactionalExecutionJournal(Path(tmp) / "journal.db")
            account = PortfolioAccount(cash=Decimal("100"))
            ledger = ExecutionLedger()
            fill = BrokerFill("o1", "A", 2, Decimal("10"), Decimal("1"))
            applied = journal.apply_broker_fill(
                account=account,
                ledger=ledger,
                fill=fill,
                event_id="trade-1",
                side="BUY",
                valuation_prices={"A": Decimal("11")},
                event_time=dt.datetime(2026, 9, 27, tzinfo=dt.UTC),
            )
            self.assertTrue(applied)
            self.assertFalse(
                journal.apply_broker_fill(
                    account=account,
                    ledger=ledger,
                    fill=fill,
                    event_id="trade-1",
                    side="BUY",
                    valuation_prices={"A": Decimal("11")},
                    event_time=dt.datetime(2026, 9, 27, tzinfo=dt.UTC),
                )
            )
            recovered = journal.recover(initial_cash=Decimal("100"))
            self.assertEqual(recovered.account.state, account.state)
            self.assertEqual(recovered.ledger.head_checkpoint(), ledger.head_checkpoint())
            self.assertEqual(recovered.applied_event_ids, {"trade-1"})

    def test_tampered_chain_fails_recovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "journal.db"
            journal = TransactionalExecutionJournal(path)
            account = PortfolioAccount(cash=Decimal("100"))
            ledger = ExecutionLedger()
            journal.apply_broker_fill(
                account=account,
                ledger=ledger,
                fill=BrokerFill("o1", "A", 1, Decimal("10"), Decimal("0")),
                event_id="trade-1",
                side="BUY",
                valuation_prices={"A": Decimal("10")},
                event_time=dt.datetime(2026, 9, 27, tzinfo=dt.UTC),
            )
            with sqlite3.connect(path) as db:
                db.execute("UPDATE execution_events SET chain_hash='tampered' WHERE seq=0")
            with self.assertRaises(RuntimeError):
                journal.recover(initial_cash=Decimal("100"))

    def test_tampered_account_state_fails_recovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "journal.db"
            journal = TransactionalExecutionJournal(path)
            account = PortfolioAccount(cash=Decimal("100"))
            ledger = ExecutionLedger()
            journal.apply_broker_fill(
                account=account,
                ledger=ledger,
                fill=BrokerFill("o1", "A", 1, Decimal("10"), Decimal("0")),
                event_id="trade-1",
                side="BUY",
                valuation_prices={"A": Decimal("10")},
                event_time=dt.datetime(2026, 9, 27, tzinfo=dt.UTC),
            )
            with sqlite3.connect(path) as db:
                db.execute("UPDATE execution_events SET cash_after='999' WHERE seq=0")
            with self.assertRaises(RuntimeError):
                journal.recover(initial_cash=Decimal("100"))

    def test_validation_failure_leaves_no_partial_journal_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "journal.db"
            journal = TransactionalExecutionJournal(path)
            account = PortfolioAccount(cash=Decimal("5"))
            ledger = ExecutionLedger()
            with self.assertRaises(ValueError):
                journal.apply_broker_fill(
                    account=account,
                    ledger=ledger,
                    fill=BrokerFill("o1", "A", 1, Decimal("10"), Decimal("0")),
                    event_id="trade-1",
                    side="BUY",
                    valuation_prices={"A": Decimal("10")},
                    event_time=dt.datetime(2026, 9, 27, tzinfo=dt.UTC),
                )
            recovered = journal.recover(initial_cash=Decimal("5"))
            self.assertEqual(recovered.applied_event_ids, frozenset())
            self.assertEqual(recovered.ledger.head_checkpoint(), (-1, "0" * 64))
            self.assertEqual(recovered.account.state.cash, Decimal("5"))

    def test_preexisting_unjournaled_ledger_state_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            journal = TransactionalExecutionJournal(Path(tmp) / "journal.db")
            account = PortfolioAccount(cash=Decimal("100"))
            ledger = ExecutionLedger()
            ledger.append(ExecutionEvent("decision", "decision", dt.datetime.now(dt.UTC)))
            with self.assertRaises(RuntimeError):
                journal.apply_broker_fill(
                    account=account,
                    ledger=ledger,
                    fill=BrokerFill("o1", "A", 1, Decimal("10"), Decimal("0")),
                    event_id="trade-1",
                    side="BUY",
                    valuation_prices={"A": Decimal("10")},
                    event_time=dt.datetime(2026, 9, 27, tzinfo=dt.UTC),
                )

    def test_unknown_schema_version_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "journal.db"
            TransactionalExecutionJournal(path)
            with sqlite3.connect(path) as db:
                db.execute("UPDATE journal_meta SET value='999' WHERE key='schema_version'")
            with self.assertRaises(RuntimeError):
                TransactionalExecutionJournal(path)

    def test_stale_portfolio_cannot_append_with_correct_ledger(self):
        with tempfile.TemporaryDirectory() as tmp:
            journal = TransactionalExecutionJournal(Path(tmp) / "journal.db")
            account = PortfolioAccount(cash=Decimal("100"))
            ledger = ExecutionLedger()
            event_time = dt.datetime(2026, 10, 17, tzinfo=dt.UTC)
            first_fill = BrokerFill("o1", "A", 1, Decimal("10"), Decimal("0"))
            journal.apply_broker_fill(
                account=account, ledger=ledger, fill=first_fill,
                event_id="trade-1", side="BUY",
                valuation_prices={"A": Decimal("10")}, event_time=event_time,
            )
            stale = PortfolioAccount(cash=Decimal("100"))
            with self.assertRaisesRegex(RuntimeError, "stale portfolio state"):
                journal.apply_broker_fill(
                    account=stale, ledger=ledger,
                    fill=BrokerFill("o2", "A", 1, Decimal("10"), Decimal("0")),
                    event_id="trade-2", side="BUY",
                    valuation_prices={"A": Decimal("10")}, event_time=event_time,
                )
            recovered = journal.recover(initial_cash=Decimal("100"))
            self.assertEqual(recovered.applied_event_ids, {"trade-1"})
            self.assertEqual(recovered.account.state.cash, Decimal("90"))
            self.assertEqual(recovered.account.state.holdings, {"A": 1})
            self.assertEqual(stale.state.cash, Decimal("100"))

    def test_correct_recovered_portfolio_can_append_next_fill(self):
        with tempfile.TemporaryDirectory() as tmp:
            journal = TransactionalExecutionJournal(Path(tmp) / "journal.db")
            event_time = dt.datetime(2026, 10, 17, tzinfo=dt.UTC)
            journal.apply_broker_fill(
                account=PortfolioAccount(cash=Decimal("100")),
                ledger=ExecutionLedger(),
                fill=BrokerFill("o1", "A", 1, Decimal("10"), Decimal("0")),
                event_id="trade-1", side="BUY",
                valuation_prices={"A": Decimal("10")}, event_time=event_time,
            )
            initial = journal.recover(initial_cash=Decimal("100"))
            self.assertTrue(journal.apply_broker_fill(
                account=initial.account, ledger=initial.ledger,
                fill=BrokerFill("o2", "A", 1, Decimal("10"), Decimal("0")),
                event_id="trade-2", side="BUY",
                valuation_prices={"A": Decimal("10")}, event_time=event_time,
            ))
            recovered = journal.recover(initial_cash=Decimal("100"))
            self.assertEqual(recovered.applied_event_ids, {"trade-1", "trade-2"})
            self.assertEqual(recovered.account.state.cash, Decimal("80"))
            self.assertEqual(recovered.account.state.holdings, {"A": 2})

    def test_substituted_ledger_same_length_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            journal = TransactionalExecutionJournal(Path(tmp) / "journal.db")
            event_time = dt.datetime(2026, 10, 17, tzinfo=dt.UTC)
            journal.apply_broker_fill(
                account=PortfolioAccount(cash=Decimal("100")),
                ledger=ExecutionLedger(),
                fill=BrokerFill("o1", "A", 1, Decimal("10"), Decimal("0")),
                event_id="trade-1", side="BUY",
                valuation_prices={"A": Decimal("10")}, event_time=event_time,
            )
            recovered = journal.recover(initial_cash=Decimal("100"))
            forged = ExecutionLedger()
            forged.append(ExecutionEvent("unrelated", "decision", event_time))
            with self.assertRaisesRegex(RuntimeError, "checkpoint divergence"):
                journal.apply_broker_fill(
                    account=recovered.account, ledger=forged,
                    fill=BrokerFill("o2", "A", 1, Decimal("10"), Decimal("0")),
                    event_id="trade-2", side="BUY",
                    valuation_prices={"A": Decimal("10")}, event_time=event_time,
                )
            self.assertEqual(
                journal.recover(initial_cash=Decimal("100")).applied_event_ids,
                {"trade-1"},
            )

    def test_recovery_rejects_rehashed_invalid_holdings_transition(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "journal.db"
            journal = TransactionalExecutionJournal(path)
            journal.apply_broker_fill(
                account=PortfolioAccount(cash=Decimal("100")),
                ledger=ExecutionLedger(),
                fill=BrokerFill("o1", "A", 1, Decimal("10"), Decimal("0")),
                event_id="trade-1", side="BUY",
                valuation_prices={"A": Decimal("10")},
                event_time=dt.datetime(2026, 10, 17, tzinfo=dt.UTC),
            )
            forged_hash = content_hash({
                "prev": GENESIS_HASH,
                "state": {
                    "cash": "90", "holdings": {"A": 2},
                    "equity": "100", "event_id": "trade-1",
                },
            })
            with sqlite3.connect(path) as db:
                db.execute(
                    "UPDATE execution_events SET holdings_json=?, state_hash=? WHERE seq=0",
                    ('{"A":2}', forged_hash),
                )
            with self.assertRaisesRegex(RuntimeError, "fill/account transition divergence"):
                journal.recover(initial_cash=Decimal("100"))
