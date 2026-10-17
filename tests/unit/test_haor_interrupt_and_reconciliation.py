"""Actual child-process interruption before SQLite commit, and late-event rejection."""

from __future__ import annotations

import datetime as dt
import os
import sqlite3
import subprocess
import sys
from dataclasses import replace

import pytest

from atlas.broker.adapter import BrokerOrderStatus
from atlas.broker.observation_journal import (
    BrokerOrderObservation,
    DurableOrderObservationJournal,
)
from atlas.execution.journal import TransactionalExecutionJournal

WHEN = dt.datetime(2026, 10, 17, tzinfo=dt.UTC)


@pytest.mark.parametrize("attempt", range(4))
def test_sqlite_child_hard_exit_before_commit_never_creates_phantom_event(
    tmp_path, attempt: int
) -> None:
    """No commit = no event, even if the process dies while holding write lock."""
    path = tmp_path / f"journal-{attempt}.db"
    TransactionalExecutionJournal(path)
    child_script = """
import os,sqlite3,sys
db=sqlite3.connect(sys.argv[1])
db.execute("PRAGMA journal_mode=WAL")
db.execute("PRAGMA synchronous=FULL")
db.execute("BEGIN IMMEDIATE")
db.execute("INSERT INTO execution_events VALUES (0,'phantom','{}','1','{}','1','x','y','z')")
os._exit(79)
"""
    child = subprocess.run(
        [sys.executable, "-c", child_script, str(path)],
        capture_output=True,
        timeout=10,
        env={**os.environ, "PYTHONPATH": "src"},
    )
    assert child.returncode == 79
    journal = TransactionalExecutionJournal(path)
    recovered = journal.recover(initial_cash=100)
    assert not recovered.applied_event_ids
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT COUNT(*) FROM execution_events").fetchone()[0] == 0


def _event(
    event: str, status: BrokerOrderStatus, fill: int, time: dt.datetime
) -> BrokerOrderObservation:
    return BrokerOrderObservation(event, "broker-1", "client-1", status, fill, 10, time)


def test_late_cancel_cannot_erase_terminal_fill_or_double_count_replay(tmp_path) -> None:
    path = tmp_path / "observations.db"
    j = DurableOrderObservationJournal(path)
    assert j.append(_event("a", BrokerOrderStatus.ACCEPTED, 0, WHEN))
    later = WHEN + dt.timedelta(seconds=10)
    assert j.append(_event("b", BrokerOrderStatus.FILLED, 10, later))
    assert not DurableOrderObservationJournal(path).append(
        _event("b", BrokerOrderStatus.FILLED, 10, later)
    )
    with pytest.raises(RuntimeError, match="illegal broker order transition"):
        j.append(_event("c", BrokerOrderStatus.CANCELLED, 10, later))
    with pytest.raises(RuntimeError, match="regressed"):
        j.append(_event("d", BrokerOrderStatus.FILLED, 10, WHEN))
    with pytest.raises(RuntimeError, match="filled status disagrees"):
        j.append(replace(_event("b", BrokerOrderStatus.FILLED, 10, later), cumulative_filled=9))
    assert len(DurableOrderObservationJournal(path).records()) == 2
