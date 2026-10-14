"""PostgreSQL adapter for the Atlas execution-persistence contract.

Construction is offline. Network/database access occurs only when a method is explicitly called.
This module has no broker or market-data authority.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import Connection

from atlas.common.hashing import canonical_json
from atlas.execution.production_persistence import (
    POSTGRES_MIGRATION_V1,
    POSTGRES_SCHEMA_VERSION,
    DurableExecutionRecord,
)
from atlas.execution.record_validation import canonical_document, verify_execution_records


class PostgresExecutionPersistence:
    def __init__(self, database_url: str, *, engine: Engine | None = None):
        if not database_url.startswith(("postgresql://", "postgresql+psycopg://")):
            raise ValueError("production execution persistence requires PostgreSQL")
        self._engine = engine or create_engine(database_url, isolation_level="SERIALIZABLE")

    @property
    def schema_version(self) -> int:
        with self._engine.connect() as db:
            value: str = str(
                db.execute(
                    text("SELECT value FROM atlas_execution_meta WHERE key='schema_version'")
                ).scalar_one()
            )
        version = int(value)
        if version != POSTGRES_SCHEMA_VERSION:
            raise RuntimeError(f"unsupported production execution schema version: {version}")
        return version

    def migrate(self) -> None:
        statements = [part.strip() for part in POSTGRES_MIGRATION_V1.split(";") if part.strip()]
        with self._engine.begin() as db:
            for statement in statements:
                db.execute(text(statement))
            version = int(
                db.execute(
                    text("SELECT value FROM atlas_execution_meta WHERE key='schema_version'")
                ).scalar_one()
            )
            if version != POSTGRES_SCHEMA_VERSION:
                raise RuntimeError("production migration schema version divergence")
            self._verify_schema(db)
        self.records()

    @staticmethod
    def _verify_schema(db: Connection) -> None:
        """IF NOT EXISTS must never silently accept an incompatible table layout."""
        rows = db.execute(
            text(
                "SELECT attname, format_type(atttypid, atttypmod) AS kind "
                "FROM pg_attribute WHERE attrelid=to_regclass('atlas_execution_events') "
                "AND attnum>0 AND NOT attisdropped"
            )
        ).mappings()
        columns = {str(row["attname"]): str(row["kind"]) for row in rows}
        required = {
            "sequence": "bigint",
            "event_id": "text",
            "event_json": "jsonb",
            "cash_after": "numeric",
            "holdings_json": "jsonb",
            "equity_after": "numeric",
            "ledger_hash": "text",
            "previous_state_hash": "text",
            "state_hash": "text",
        }
        if any(columns.get(name) != kind for name, kind in required.items()):
            raise RuntimeError("incompatible execution schema column layout")
        constraint_rows: list[object] = list(
            db.execute(
                text(
                    "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
                    "WHERE conrelid=to_regclass('atlas_execution_events')"
                )
            ).scalars().all()
        )
        constraints = {str(value) for value in constraint_rows}
        if not {
            "PRIMARY KEY (sequence)",
            "UNIQUE (event_id)",
            "UNIQUE (ledger_hash)",
            "UNIQUE (state_hash)",
        }.issubset(constraints):
            raise RuntimeError("execution schema uniqueness constraint missing")

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
            # Locking the same metadata row serializes concurrent writers even
            # when the event table is empty. An inconsistent journal is never
            # allowed to return a successful duplicate acknowledgement.
            prior = self._read_records(db)
            verify_execution_records(prior)
            old = next((item for item in prior if item.event_id == record.event_id), None)
            if old is not None:
                if (
                    old.sequence == record.sequence
                    and canonical_document(old.event_json) == canonical_document(record.event_json)
                    and old.cash_after == record.cash_after
                    and canonical_document(old.holdings_json)
                    == canonical_document(record.holdings_json)
                    and old.equity_after == record.equity_after
                    and old.ledger_hash == record.ledger_hash
                    and old.previous_state_hash == record.previous_state_hash
                    and old.state_hash == record.state_hash
                ):
                    return False
                raise RuntimeError("conflicting replay for production execution event")
            if record.sequence != len(prior):
                raise RuntimeError("production execution sequence divergence")
            verify_execution_records((*prior, record))
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

    @staticmethod
    def _read_records(db: object) -> tuple[DurableExecutionRecord, ...]:
        # The live Connection implements execute; separate for test doubles and
        # a single transaction-level verification snapshot.
        if not isinstance(db, Connection):
            raise TypeError("expected SQLAlchemy connection")
        rows = db.execute(
            text(
                "SELECT sequence,event_id,event_json::text AS event_json,cash_after,"
                "holdings_json::text AS holdings_json,equity_after,ledger_hash,"
                "previous_state_hash,state_hash FROM atlas_execution_events ORDER BY sequence"
            )
        ).mappings()
        return tuple(
            DurableExecutionRecord(
                int(row["sequence"]),
                str(row["event_id"]),
                canonical_json(canonical_document(str(row["event_json"]))),
                Decimal(str(row["cash_after"])),
                canonical_json(canonical_document(str(row["holdings_json"]))),
                Decimal(str(row["equity_after"])),
                str(row["ledger_hash"]),
                str(row["previous_state_hash"]),
                str(row["state_hash"]),
            )
            for row in rows
        )

    def records(self) -> tuple[DurableExecutionRecord, ...]:
        if self.schema_version != POSTGRES_SCHEMA_VERSION:
            raise RuntimeError("production execution schema mismatch")
        with self._engine.connect() as db:
            records = self._read_records(db)
        verify_execution_records(records)
        return records
