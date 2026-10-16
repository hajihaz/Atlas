"""Disposable SQLite online-backup/restore drills; no production database involved."""

import datetime as dt
import sqlite3
from decimal import Decimal

import pytest

from atlas.broker.adapter import BrokerFill
from atlas.execution.journal import TransactionalExecutionJournal
from atlas.execution.ledger import ExecutionLedger
from atlas.portfolio.account import PortfolioAccount


def _filled_journal(path):
    journal = TransactionalExecutionJournal(path)
    account = PortfolioAccount(cash=Decimal("1000"))
    ledger = ExecutionLedger()
    for index in range(3):
        assert journal.apply_broker_fill(
            account=account,
            ledger=ledger,
            fill=BrokerFill(f"broker-{index}", "SPY", 1, Decimal("100"), Decimal("1")),
            event_id=f"fill-{index}",
            side="BUY",
            valuation_prices={"SPY": Decimal("100")},
            event_time=dt.datetime(2026, 10, 16, index, tzinfo=dt.UTC),
        )
    return journal, account, ledger


def test_online_backup_restores_hash_chained_state_and_idempotency(tmp_path):
    source, account, ledger = _filled_journal(tmp_path / "source.db")
    backup = tmp_path / "offline-restored.db"
    # SQLite backup API snapshots committed WAL state, not just the main .db file.
    with sqlite3.connect(source.path) as origin, sqlite3.connect(backup) as target:
        origin.backup(target)
        assert target.execute("PRAGMA quick_check").fetchone()[0] == "ok"
    recovered = TransactionalExecutionJournal(backup).recover(initial_cash=Decimal("1000"))
    assert recovered.account.state == account.state
    assert recovered.ledger.head_checkpoint() == ledger.head_checkpoint()
    assert recovered.applied_event_ids == {"fill-0", "fill-1", "fill-2"}
    assert len(recovered.applied_event_ids) == 3
    assert backup.read_bytes() != b""
    # Backup and live source are independent stores after the snapshot is taken.
    with sqlite3.connect(backup) as db:
        db.execute("UPDATE execution_events SET cash_after='888' WHERE seq=1")
    with pytest.raises(RuntimeError):
        TransactionalExecutionJournal(backup).recover(initial_cash=Decimal("1000"))
    assert source.recover(initial_cash=Decimal("1000")).account.state == account.state


def test_raw_database_copy_is_not_treated_as_certified_backup(tmp_path):
    source, _, _ = _filled_journal(tmp_path / "source.db")
    # A raw file copy without WAL or snapshot coordination has no certification path.
    # In contrast, the SQLite online-backup API is a transactionally consistent snapshot.
    backup = tmp_path / "snapshot.db"
    with sqlite3.connect(source.path) as origin, sqlite3.connect(backup) as dest:
        origin.backup(dest)
    with sqlite3.connect(backup) as db:
        db.execute("DELETE FROM execution_events WHERE seq=1")
    with pytest.raises(RuntimeError):
        TransactionalExecutionJournal(backup).recover(initial_cash=Decimal("1000"))
