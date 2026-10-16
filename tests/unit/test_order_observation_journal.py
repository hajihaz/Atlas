"""Adversarial durable order observation and process-recovery checks."""

from __future__ import annotations

import datetime as dt
import os
import sqlite3
import subprocess
import sys
from dataclasses import replace

import pytest

from atlas.broker.adapter import BrokerOrderStatus as S
from atlas.broker.observation_journal import BrokerOrderObservation as O
from atlas.broker.observation_journal import DurableOrderObservationJournal as J

WHEN = dt.datetime(2026, 10, 16, tzinfo=dt.UTC)


def observation(
    status: S = S.ACCEPTED,
    *,
    event: str = "a",
    filled: int = 0,
    when: dt.datetime = WHEN,
) -> O:
    return O(event, "broker-1", "client-1", status, filled, 10, when)


def test_partial_fill_cancel_recovery_and_idempotency(tmp_path):
    path = tmp_path / "orders.db"
    journal = J(path)
    assert journal.append(observation())
    assert not journal.append(observation())
    assert journal.append(observation(S.PARTIALLY_FILLED, event="b", filled=4))
    assert journal.append(observation(S.CANCELLED, event="c", filled=4))
    assert J(path).records() == (
        observation(),
        observation(S.PARTIALLY_FILLED, event="b", filled=4),
        observation(S.CANCELLED, event="c", filled=4),
    )
    assert len(J(path).verify()) == 64
    with pytest.raises(RuntimeError, match="illegal broker order transition"):
        journal.append(observation(S.FILLED, event="d", filled=10))


@pytest.mark.parametrize(
    "bad",
    [
        observation(S.UNKNOWN),
        observation(S.ACCEPTED, filled=1),
        observation(S.FILLED, filled=2),
        observation(S.PARTIALLY_FILLED, filled=0),
        replace(observation(), requested_quantity=True),
        replace(observation(), observed_at=dt.datetime(2026, 10, 16)),
    ],
)
def test_invalid_broker_observations_never_commit(tmp_path, bad):
    journal = J(tmp_path / "orders.db")
    with pytest.raises((RuntimeError, ValueError)):
        journal.append(bad)
    assert journal.records() == ()


def test_changed_duplicate_and_regressing_quantities_fail_closed(tmp_path):
    journal = J(tmp_path / "orders.db")
    journal.append(observation())
    with pytest.raises(RuntimeError, match="conflicting"):
        journal.append(observation(S.PARTIALLY_FILLED, filled=4))
    journal.append(observation(S.PARTIALLY_FILLED, event="b", filled=4))
    with pytest.raises(RuntimeError, match="regressed"):
        journal.append(observation(S.PARTIALLY_FILLED, event="c", filled=2))
    assert len(journal.records()) == 2


def test_tampered_history_blocks_reads_and_new_appends(tmp_path):
    path = tmp_path / "orders.db"
    journal = J(path)
    journal.append(observation())
    with sqlite3.connect(path) as db:
        db.execute("UPDATE broker_order_observations SET payload='{}' WHERE seq=0")
    with pytest.raises(RuntimeError):
        journal.records()
    with pytest.raises(RuntimeError):
        journal.append(observation(S.FILLED, event="b", filled=10))


def test_child_process_dies_after_commit_then_recovery_is_idempotent(tmp_path):
    path = tmp_path / "orders.db"
    source = """
import datetime as dt,os,sys
from pathlib import Path
from atlas.broker.adapter import BrokerOrderStatus as S
from atlas.broker.observation_journal import (
    BrokerOrderObservation as O,
    DurableOrderObservationJournal as J,
)
t=dt.datetime(2026,10,16,tzinfo=dt.UTC)
J(Path(sys.argv[1])).append(O('evt','bo','co',S.ACCEPTED,0,1,t))
os._exit(72)
"""
    env = {**os.environ, "PYTHONPATH": "src"}
    result = subprocess.run(
        [sys.executable, "-c", source, str(path)],
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 72
    journal = J(path)
    assert len(journal.records()) == 1
    t = dt.datetime(2026, 10, 16, tzinfo=dt.UTC)
    assert not journal.append(O("evt", "bo", "co", S.ACCEPTED, 0, 1, t))
    assert journal.append(O("fill", "bo", "co", S.FILLED, 1, 1, t))
    assert len(journal.records()) == 2


def test_competing_threads_append_separate_order_events_without_chain_fork(tmp_path):
    from concurrent.futures import ThreadPoolExecutor

    path = tmp_path / "concurrent.db"
    journal = J(path)
    journal.append(observation())
    later = WHEN + dt.timedelta(seconds=5)

    def append(index):
        candidate = O(
            f"event-{index}",
            f"broker-{index + 10}",
            f"client-{index + 10}",
            S.ACCEPTED,
            0,
            1,
            later,
        )
        return J(path).append(candidate)

    with ThreadPoolExecutor(max_workers=4) as pool:
        outcome = list(pool.map(append, range(12)))
    assert all(outcome)
    assert len(J(path).records()) == 13
    assert len(J(path).verify()) == 64


def test_trigger_fails_before_commit_and_no_partial_event_is_recorded(tmp_path):
    path = tmp_path / "reject-event.db"
    journal = J(path)
    journal.append(observation())
    with sqlite3.connect(path) as db:
        db.execute(
            "CREATE TRIGGER reject_forged BEFORE INSERT ON broker_order_observations "
            "WHEN NEW.event_id='reject-me' BEGIN SELECT RAISE(ABORT,'blocked'); END"
        )
    with pytest.raises(sqlite3.DatabaseError):
        journal.append(O("reject-me", "bo2", "co2", S.ACCEPTED, 0, 1, WHEN))
    assert journal.records() == (observation(),)


def test_multiple_child_processes_append_without_losing_durable_events(tmp_path):
    path = tmp_path / "orders-multiprocess.db"
    J(path)
    source = """
import datetime as dt,sys
from pathlib import Path
from atlas.broker.adapter import BrokerOrderStatus as S
from atlas.broker.observation_journal import (
    BrokerOrderObservation as O,
    DurableOrderObservationJournal as J,
)
key=sys.argv[2]
J(Path(sys.argv[1])).append(O(key,key,key,S.ACCEPTED,0,1,dt.datetime(2026,10,16,tzinfo=dt.UTC)))
"""
    children = [
        subprocess.Popen(
            [sys.executable, "-c", source, str(path), f"child-{index}"],
            env={**os.environ, "PYTHONPATH": "src"},
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for index in range(4)
    ]
    for child in children:
        _out, err = child.communicate(timeout=20)
        assert child.returncode == 0, err
    assert len(J(path).records()) == 4
    assert J(path).verify() != "0" * 64
