"""Process-kill fault injection at real journal INSERT and COMMIT boundaries.

The only files mutated are disposable pytest tmp_path SQLite databases.
Broker fills are synthetic, and no network or live-money execution is possible.
"""

from __future__ import annotations

import datetime as dt
import os
import subprocess
import sys
from decimal import Decimal

import pytest

from atlas.broker.adapter import BrokerFill
from atlas.execution.journal import TransactionalExecutionJournal

# Failpoints are installed inside a child process's SQLite connection factory.
# Unlike raw-SQL crash tests, these exercise apply_broker_fill itself.
_CHILD = r"""
import datetime as dt
import os
import sqlite3
import sys
from decimal import Decimal
from pathlib import Path

from atlas.broker.adapter import BrokerFill
from atlas.execution.journal import TransactionalExecutionJournal
from atlas.execution.ledger import ExecutionLedger
from atlas.portfolio.account import PortfolioAccount

path, phase, marker_path = sys.argv[1:]
journal = TransactionalExecutionJournal(path)

def marker():
    # durable marker proves the intended kill point was reached.
    with open(marker_path, 'wb') as fp:
        fp.write(phase.encode())
        fp.flush()
        os.fsync(fp.fileno())

class FaultingConnection(sqlite3.Connection):
    def execute(self, sql, parameters=()):
        result = super().execute(sql, parameters)
        if phase == 'after_insert_before_commit' and sql.startswith('INSERT INTO execution_events'):
            marker()
            os._exit(81)
        return result

    def commit(self):
        if phase == 'before_commit':
            marker()
            os._exit(82)
        result = super().commit()
        if phase == 'after_commit_before_memory':
            marker()
            os._exit(83)
        return result

def injected_connect():
    conn = sqlite3.connect(path, factory=FaultingConnection)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=FULL')
    return conn

journal._connect = injected_connect
journal.apply_broker_fill(
    account=PortfolioAccount(cash=Decimal('100')),
    ledger=ExecutionLedger(),
    fill=BrokerFill('o1', 'A', 2, Decimal('10'), Decimal('1')),
    event_id='kill-window-fill', side='BUY',
    valuation_prices={'A': Decimal('11')},
    event_time=dt.datetime(2026, 10, 26, tzinfo=dt.UTC),
)
sys.exit(9)  # A normal return would mean the fault injection did not execute.
"""


@pytest.mark.parametrize(
    ("phase", "exit_code", "persisted"),
    [
        ("after_insert_before_commit", 81, False),
        ("before_commit", 82, False),
        ("after_commit_before_memory", 83, True),
    ],
)
def test_actual_journal_commit_windows_fail_closed(
    tmp_path, phase: str, exit_code: int, persisted: bool
) -> None:
    path = tmp_path / "crash-only-test.sqlite"
    marker = tmp_path / "reached.txt"
    TransactionalExecutionJournal(path)
    env = os.environ.copy()
    env["PYTHONPATH"] = "src"
    result = subprocess.run(
        [sys.executable, "-c", _CHILD, str(path), phase, str(marker)],
        env=env,
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )
    assert result.returncode == exit_code, result.stderr + result.stdout
    assert marker.read_text() == phase

    for _ in range(3):
        journal = TransactionalExecutionJournal(path)
        state = journal.recover(initial_cash=Decimal("100"))
        assert state.ledger.head_checkpoint()[0] == (0 if persisted else -1)
        assert state.applied_event_ids == ({"kill-window-fill"} if persisted else set())
        assert state.account.state.cash == Decimal("79" if persisted else "100")
        assert state.account.state.holdings == ({"A": 2} if persisted else {})

    # Repeat the same broker observation: no duplicate cash change / double fill.
    fill = BrokerFill("o1", "A", 2, Decimal("10"), Decimal("1"))
    timestamp = dt.datetime(2026, 10, 26, tzinfo=dt.UTC)
    journal = TransactionalExecutionJournal(path)
    state = journal.recover(initial_cash=Decimal("100"))
    applied = journal.apply_broker_fill(
        account=state.account,
        ledger=state.ledger,
        fill=fill,
        event_id="kill-window-fill",
        side="BUY",
        valuation_prices={"A": Decimal("11")},
        event_time=timestamp,
    )
    assert applied is not persisted
    final = TransactionalExecutionJournal(path).recover(initial_cash=Decimal("100"))
    assert final.applied_event_ids == {"kill-window-fill"}
    assert final.account.state.cash == Decimal("79")
    assert final.account.state.holdings == {"A": 2}


def test_second_fill_after_post_commit_crash_recovery(tmp_path) -> None:
    path = tmp_path / "restarted.sqlite"
    marker = tmp_path / "commit_marker"
    TransactionalExecutionJournal(path)
    env = os.environ.copy()
    env["PYTHONPATH"] = "src"
    run = subprocess.run(
        [sys.executable, "-c", _CHILD, str(path), "after_commit_before_memory", str(marker)],
        env=env,
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )
    assert run.returncode == 83, run.stderr
    journal = TransactionalExecutionJournal(path)
    state = journal.recover(initial_cash=Decimal("100"))
    assert journal.apply_broker_fill(
        account=state.account,
        ledger=state.ledger,
        fill=BrokerFill("o2", "A", 1, Decimal("12"), Decimal("0")),
        event_id="next-fill",
        side="BUY",
        valuation_prices={"A": Decimal("12")},
        event_time=dt.datetime(2026, 10, 26, 10, tzinfo=dt.UTC),
    )
    final = TransactionalExecutionJournal(path).recover(initial_cash=Decimal("100"))
    assert final.applied_event_ids == {"kill-window-fill", "next-fill"}
    assert final.account.state.holdings == {"A": 3}
    assert final.account.state.cash == Decimal("67")
    assert len(final.ledger.entries()) == 2
