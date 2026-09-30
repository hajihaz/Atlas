from decimal import Decimal

import pytest

from atlas.execution.production_persistence import (
    POSTGRES_MIGRATION_V1,
    POSTGRES_SCHEMA_VERSION,
    DurableExecutionRecord,
)


def test_production_contract_is_versioned_and_append_only_by_migration() -> None:
    assert POSTGRES_SCHEMA_VERSION == 1
    assert "event_id text NOT NULL UNIQUE" in POSTGRES_MIGRATION_V1
    assert "sequence bigint PRIMARY KEY" in POSTGRES_MIGRATION_V1
    assert "state_hash text NOT NULL UNIQUE" in POSTGRES_MIGRATION_V1
    assert "REVOKE UPDATE, DELETE, TRUNCATE" in POSTGRES_MIGRATION_V1


def test_production_record_fails_closed_without_identity_or_hashes() -> None:
    record = DurableExecutionRecord(0, "", "{}", Decimal("1"), "{}", Decimal("1"), "", "", "")
    with pytest.raises(ValueError):
        record.validate()


def test_postgres_adapter_rejects_non_postgres_database() -> None:
    from atlas.execution.postgres_persistence import PostgresExecutionPersistence

    with pytest.raises(ValueError, match="requires PostgreSQL"):
        PostgresExecutionPersistence("sqlite:///not-production.db")
