"""Real subprocess interruption tests for SQLite journal crash windows."""
from __future__ import annotations

import os
import subprocess
import sys
from decimal import Decimal

from atlas.execution.journal import TransactionalExecutionJournal


def _child(code: str, db: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = "src"
    return subprocess.run([sys.executable, "-c", code, db], env=env, text=True, capture_output=True)


def test_process_death_inside_uncommitted_sqlite_transaction_rolls_back(tmp_path) -> None:
    path = tmp_path / "journal.db"
    TransactionalExecutionJournal(path)
    code = r'''import os, sqlite3, sys
p=sys.argv[1]
db=sqlite3.connect(p)
db.execute("PRAGMA journal_mode=WAL")
db.execute("BEGIN IMMEDIATE")
db.execute("INSERT INTO execution_events VALUES (0,'crash','{}','100','{}','100','lh','ph','sh')")
os._exit(91)
'''
    result = _child(code, str(path))
    assert result.returncode == 91
    recovered = TransactionalExecutionJournal(path).recover(initial_cash=Decimal("100"))
    assert recovered.applied_event_ids == frozenset()
    assert recovered.ledger.head_checkpoint() == (-1, "0" * 64)


def test_process_death_after_commit_recovers_committed_fill(tmp_path) -> None:
    path = tmp_path / "journal.db"
    code = r'''import datetime as dt, os, sys
from decimal import Decimal
from atlas.broker.adapter import BrokerFill
from atlas.execution.journal import TransactionalExecutionJournal
from atlas.execution.ledger import ExecutionLedger
from atlas.portfolio.account import PortfolioAccount
j=TransactionalExecutionJournal(sys.argv[1])
a=PortfolioAccount(cash=Decimal('100'))
l=ExecutionLedger()
j.apply_broker_fill(
    account=a, ledger=l, fill=BrokerFill('o1','A',1,Decimal('10'),Decimal('1')),
    event_id='trade-1', side='BUY', valuation_prices={'A':Decimal('11')},
    event_time=dt.datetime(2026,9,30,tzinfo=dt.UTC),
)
os._exit(92)
'''
    result = _child(code, str(path))
    assert result.returncode == 92
    recovered = TransactionalExecutionJournal(path).recover(initial_cash=Decimal("100"))
    assert recovered.applied_event_ids == {"trade-1"}
    assert recovered.account.state.cash == Decimal("89")


def test_wal_garbage_after_committed_state_does_not_change_recovery(tmp_path) -> None:
    path = tmp_path / "journal.db"
    TransactionalExecutionJournal(path)
    wal = path.with_name(path.name + "-wal")
    if wal.exists():
        with wal.open("ab") as handle:
            handle.write(b"ATLAS-INTERRUPTED-WAL-TAIL")
    recovered = TransactionalExecutionJournal(path).recover(initial_cash=Decimal("100"))
    assert recovered.applied_event_ids == frozenset()
