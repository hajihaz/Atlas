"""PostgreSQL adapter for the Atlas execution-persistence contract.

Construction is offline. Network/database access occurs only when a method is explicitly called.
This module has no broker or market-data authority.
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Engine, create_engine, text

from atlas.execution.production_persistence import (
    POSTGRES_MIGRATION_V1,
    POSTGRES_SCHEMA_VERSION,
    DurableExecutionRecord,
)


class PostgresExecutionPersistence:
    def __init__(self, database_url: str, *, engine: Engine | None = None):
        if not database_url.startswith(("postgresql://", "postgresql+psycopg://")):
            raise ValueError("production execution persistence requires PostgreSQL")
        self._engine = engine or create_engine(database_url, isolation_level="SERIALIZABLE")

    @property
    def schema_version(self) -> int:
        with self._engine.connect() as db:
            value: str = str(db.execute(
                text("SELECT value FROM atlas_execution_meta WHERE key='schema_version'")
            ).scalar_one())
        version = int(value)
        if version != POSTGRES_SCHEMA_VERSION:
            raise RuntimeError(f"unsupported production execution schema version: {version}")
        return version

    def migrate(self) -> None:
        statements = [part.strip() for part in POSTGRES_MIGRATION_V1.split(";") if part.strip()]
        with self._engine.begin() as db:
            for statement in statements:
                db.execute(text(statement))

    def append(self, record: DurableExecutionRecord) -> bool:
        record.validate()
        with self._engine.begin() as db:
            version = int(
                db.execute(
                    text(
                        "SELECT value FROM atlas_execution_meta "
                        "WHERE key='schema_version' FOR UPDATE"
                    )
                ).scalar_one()
            )
            if version != POSTGRES_SCHEMA_VERSION:
                raise RuntimeError(f"unsupported production execution schema version: {version}")
            existing = db.execute(
                text(
                    "SELECT sequence,event_json,cash_after,holdings_json,equity_after,ledger_hash,"
                    "previous_state_hash,state_hash FROM atlas_execution_events "
                    "WHERE event_id=:event_id"
                ),
                {"event_id": record.event_id},
            ).mappings().first()
            if existing is not None:
                same = (
                    int(existing["sequence"]) == record.sequence
                    and str(existing["event_json"]) == record.event_json
                    and Decimal(str(existing["cash_after"])) == record.cash_after
                    and str(existing["holdings_json"]) == record.holdings_json
                    and Decimal(str(existing["equity_after"])) == record.equity_after
                    and existing["ledger_hash"] == record.ledger_hash
                    and existing["previous_state_hash"] == record.previous_state_hash
                    and existing["state_hash"] == record.state_hash
                )
                if same:
                    return False
                raise RuntimeError("conflicting replay for production execution event")
            latest = db.execute(
                text(
                    "SELECT sequence FROM atlas_execution_events "
                    "ORDER BY sequence DESC LIMIT 1 FOR UPDATE"
                )
            ).scalar_one_or_none()
            expected = 0 if latest is None else int(str(latest)) + 1
            if expected != record.sequence:
                raise RuntimeError("production execution sequence divergence")
            db.execute(
                text(
                    "INSERT INTO atlas_execution_events "
                    "(sequence,event_id,event_json,cash_after,holdings_json,equity_after,ledger_hash,"
                    "previous_state_hash,state_hash) VALUES "
                    "(:sequence,:event_id,CAST(:event_json AS jsonb),:cash_after,"
                    "CAST(:holdings_json AS jsonb),:equity_after,:ledger_hash,:previous_state_hash,"
                    ":state_hash)"
                ),
                record.__dict__,
            )
        return True

    def records(self) -> tuple[DurableExecutionRecord, ...]:
        with self._engine.connect() as db:
            rows = db.execute(
                text(
                    "SELECT sequence,event_id,event_json::text AS event_json,cash_after,"
                    "holdings_json::text AS holdings_json,equity_after,ledger_hash,"
                    "previous_state_hash,state_hash FROM atlas_execution_events ORDER BY sequence"
                )
            ).mappings()
            return tuple(
                DurableExecutionRecord(
                    int(row["sequence"]), str(row["event_id"]), str(row["event_json"]),
                    Decimal(str(row["cash_after"])), str(row["holdings_json"]),
                    Decimal(str(row["equity_after"])), str(row["ledger_hash"]),
                    str(row["previous_state_hash"]), str(row["state_hash"]),
                )
                for row in rows
            )
