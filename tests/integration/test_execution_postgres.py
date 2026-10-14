"""Isolated PostgreSQL execution journal certification (never run against production)."""

from __future__ import annotations

import datetime as dt
import os
import sqlite3
import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest

from atlas.broker.adapter import BrokerFill
from atlas.execution.journal import TransactionalExecutionJournal
from atlas.execution.ledger import ExecutionLedger
from atlas.execution.postgres_persistence import PostgresExecutionPersistence
from atlas.execution.production_persistence import DurableExecutionRecord
from atlas.portfolio.account import PortfolioAccount

pytestmark = pytest.mark.integration


@pytest.mark.skipif(
    not os.environ.get("ATLAS_EXECUTION_TEST_DB"),
    reason="ATLAS_EXECUTION_TEST_DB not set (isolated PostgreSQL only)",
)
def test_postgres_atomic_replay_chain_and_concurrent_writers(tmp_path) -> None:
    url = os.environ["ATLAS_EXECUTION_TEST_DB"]
    journal = TransactionalExecutionJournal(tmp_path / "reference.db")
    account = PortfolioAccount(cash=Decimal("100"))
    ledger = ExecutionLedger()
    records = []
    for index, qty in enumerate((1, 2)):
        event_id = f"trade-{index}"
        journal.apply_broker_fill(
            account=account,
            ledger=ledger,
            fill=BrokerFill(f"order-{index}", "A", qty, Decimal("10"), Decimal("1")),
            event_id=event_id,
            side="BUY",
            valuation_prices={"A": Decimal("11")},
            event_time=dt.datetime(2026, 10, 15, tzinfo=dt.UTC),
        )
    with sqlite3.connect(journal.path) as db:
        for row in db.execute(
            "SELECT seq,event_id,event_json,cash_after,holdings_json,equity_after,"
            "chain_hash,prev_state_hash,state_hash FROM execution_events ORDER BY seq"
        ):
            records.append(
                DurableExecutionRecord(
                    int(row[0]),
                    row[1],
                    row[2],
                    Decimal(row[3]),
                    row[4],
                    Decimal(row[5]),
                    row[6],
                    row[7],
                    row[8],
                )
            )

    from sqlalchemy import create_engine, text

    schema = "atlas_test_" + uuid.uuid4().hex
    administrative_engine = create_engine(url)
    with administrative_engine.begin() as db:
        db.execute(text(f"CREATE SCHEMA {schema}"))
    scoped_engine = create_engine(
        url,
        isolation_level="SERIALIZABLE",
        connect_args={"options": f"-csearch_path={schema}"},
    )
    store = PostgresExecutionPersistence(url, engine=scoped_engine)
    store.migrate()
    store.migrate()  # migration is idempotent, not destructive
    assert store.schema_version == 1
    first = records[0]
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(store.append, first) for _ in range(2)]
        outcomes = []
        for future in futures:
            try:
                outcomes.append(future.result())
            except Exception as exc:
                # Serializable conflict is acceptable only if the winning
                # transaction has fully committed and can be replayed.
                assert type(exc).__name__ in ("SerializationFailure", "OperationalError")
        assert outcomes.count(True) == 1
    assert len(store.records()) == 1
    assert store.append(first) is False
    assert store.append(records[1]) is True
    assert store.records() == tuple(records)
    assert store.append(records[1]) is False

    from dataclasses import replace

    with pytest.raises(RuntimeError, match="conflicting replay"):
        store.append(replace(records[1], equity_after=Decimal("999")))
    with pytest.raises(RuntimeError, match="sequence divergence"):
        store.append(replace(records[1], sequence=5, event_id="new-event"))

    from sqlalchemy import text

    with store._engine.begin() as db:
        db.execute(text("UPDATE atlas_execution_events SET cash_after=999 WHERE sequence=0"))
    with pytest.raises(RuntimeError, match="execution"):
        store.records()
    with pytest.raises(RuntimeError, match="execution"):
        store.append(first)
    scoped_engine.dispose()
    with administrative_engine.begin() as db:
        db.execute(text(f"DROP SCHEMA {schema} CASCADE"))
    administrative_engine.dispose()
