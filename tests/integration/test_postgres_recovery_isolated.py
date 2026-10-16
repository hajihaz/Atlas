"""PostgreSQL migration and logical restore contract against TEST-only scoped schemas."""

from __future__ import annotations

import datetime as dt
import os
import sqlite3
import uuid
from decimal import Decimal

import pytest

from atlas.broker.adapter import BrokerFill
from atlas.execution.journal import TransactionalExecutionJournal
from atlas.execution.ledger import ExecutionLedger
from atlas.execution.postgres_persistence import PostgresExecutionPersistence
from atlas.execution.production_persistence import DurableExecutionRecord
from atlas.portfolio.account import PortfolioAccount

pytestmark = pytest.mark.integration


@pytest.fixture()
def isolated_schemas():
    url = os.environ.get("ATLAS_EXECUTION_TEST_DB")
    if not url:
        pytest.skip("ATLAS_EXECUTION_TEST_DB unavailable; never use production")
    from sqlalchemy import create_engine, text

    admin = create_engine(url)
    names = ["atlas_restore_" + uuid.uuid4().hex for _ in range(2)]
    with admin.begin() as db:
        for name in names:
            db.execute(text(f"CREATE SCHEMA {name}"))
    try:
        engines = [
            create_engine(
                url,
                isolation_level="SERIALIZABLE",
                connect_args={"options": f"-csearch_path={name}"},
            )
            for name in names
        ]
        try:
            yield url, admin, tuple(names), tuple(engines)
        finally:
            for engine in engines:
                engine.dispose()
    finally:
        with admin.begin() as db:
            for name in names:
                db.execute(text(f"DROP SCHEMA {name} CASCADE"))
        admin.dispose()


def _source_record(tmp_path):
    journal = TransactionalExecutionJournal(tmp_path / "reference-journal.db")
    account = PortfolioAccount(cash=Decimal("1000"))
    ledger = ExecutionLedger()
    journal.apply_broker_fill(
        account=account,
        ledger=ledger,
        fill=BrokerFill("broker-1", "SPY", 3, Decimal("100"), Decimal("1")),
        event_id="fill-1",
        side="BUY",
        valuation_prices={"SPY": Decimal("101")},
        event_time=dt.datetime(2026, 10, 16, tzinfo=dt.UTC),
    )
    with sqlite3.connect(journal.path) as db:
        raw = db.execute(
            "SELECT seq,event_id,event_json,cash_after,holdings_json,equity_after,"
            "chain_hash,prev_state_hash,state_hash FROM execution_events"
        ).fetchone()
    assert raw is not None
    return DurableExecutionRecord(
        int(raw[0]),
        raw[1],
        raw[2],
        Decimal(raw[3]),
        raw[4],
        Decimal(raw[5]),
        raw[6],
        raw[7],
        raw[8],
    )


def test_logical_restore_in_new_schema_preserves_chain_and_replay(tmp_path, isolated_schemas):
    url, _admin, _names, engines = isolated_schemas
    original = PostgresExecutionPersistence(url, engine=engines[0])
    restored = PostgresExecutionPersistence(url, engine=engines[1])
    for store in (original, restored):
        store.migrate()
    record = _source_record(tmp_path)
    assert original.append(record)
    evidence = original.records()
    assert len(evidence) == 1
    for item in evidence:
        assert restored.append(item)
    assert restored.records() == evidence
    assert not restored.append(evidence[0])
    assert original.records() == evidence


def test_preexisting_incompatible_schema_migration_is_rejected(isolated_schemas):
    url, _admin, _names, engines = isolated_schemas
    from sqlalchemy import text

    with engines[0].begin() as db:
        db.execute(
            text("CREATE TABLE atlas_execution_events(sequence text PRIMARY KEY, event_id text)")
        )
    broken = PostgresExecutionPersistence(url, engine=engines[0])
    with pytest.raises(RuntimeError, match="schema column layout"):
        broken.migrate()
