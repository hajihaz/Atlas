"""Extra offline journal safety: filesystem and malformed-identity scenarios."""

import datetime as dt
import os
import sqlite3

import pytest

from atlas.broker.adapter import BrokerOrderStatus
from atlas.broker.observation_journal import BrokerOrderObservation, DurableOrderObservationJournal

WHEN = dt.datetime(2026, 10, 16, tzinfo=dt.UTC)


@pytest.mark.parametrize("invalid", [None, 123, True, "", "  "])
def test_malformed_broker_identity_is_not_coerced_to_text(invalid: object) -> None:
    body: dict[str, object] = {
        "event_id": invalid,
        "broker_order_id": "broker",
        "client_order_id": "client",
        "status": "accepted",
        "cumulative_filled": 0,
        "requested_quantity": 1,
        "observed_at": WHEN.isoformat(),
    }
    with pytest.raises((RuntimeError, ValueError)):
        BrokerOrderObservation.from_dict(body)


def test_journal_private_permissions_and_symlinks_refused(tmp_path) -> None:
    target = tmp_path / "original.db"
    journal = DurableOrderObservationJournal(target)
    assert os.stat(target).st_mode & 0o077 == 0
    assert journal.append(
        BrokerOrderObservation("e", "b", "c", BrokerOrderStatus.ACCEPTED, 0, 1, WHEN)
    )
    alias = tmp_path / "alias.db"
    alias.symlink_to(target)
    with pytest.raises(RuntimeError, match="symlinks"):
        DurableOrderObservationJournal(alias)
    assert len(journal.records()) == 1


def test_wrong_existing_journal_schema_fails_closed(tmp_path) -> None:
    dbpath = tmp_path / "forged.db"
    with sqlite3.connect(dbpath) as connection:
        connection.execute("CREATE TABLE broker_order_observations (payload TEXT)")
    with pytest.raises(RuntimeError, match="unsafe"):
        DurableOrderObservationJournal(dbpath)
