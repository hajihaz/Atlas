"""Provider-neutral durable execution persistence contract.

The contract preserves Atlas journal invariants without provisioning infrastructure or
introducing broker/network authority. A production PostgreSQL adapter must implement these
semantics inside one SERIALIZABLE database transaction.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol


@dataclass(frozen=True)
class DurableExecutionRecord:
    sequence: int
    event_id: str
    event_json: str
    cash_after: Decimal
    holdings_json: str
    equity_after: Decimal
    ledger_hash: str
    previous_state_hash: str
    state_hash: str

    def validate(self) -> None:
        if self.sequence < 0 or not self.event_id:
            raise ValueError("invalid execution record identity")
        if not self.event_json or not self.holdings_json:
            raise ValueError("execution record payload is required")
        if not self.ledger_hash or not self.previous_state_hash or not self.state_hash:
            raise ValueError("execution record hash chain is required")


class ExecutionPersistence(Protocol):
    """Atomic exactly-once store; implementations must fail closed on divergence."""

    @property
    def schema_version(self) -> int: ...

    def append(self, record: DurableExecutionRecord) -> bool:
        """Atomically append; False only for an identical already-applied event."""
        ...

    def records(self) -> tuple[DurableExecutionRecord, ...]: ...


POSTGRES_SCHEMA_VERSION = 1
POSTGRES_MIGRATION_V1 = """
CREATE TABLE IF NOT EXISTS atlas_execution_meta (
  key text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO atlas_execution_meta(key, value) VALUES ('schema_version', '1')
ON CONFLICT (key) DO NOTHING;
CREATE TABLE IF NOT EXISTS atlas_execution_events (
  sequence bigint PRIMARY KEY CHECK (sequence >= 0),
  event_id text NOT NULL UNIQUE,
  event_json jsonb NOT NULL,
  cash_after numeric NOT NULL,
  holdings_json jsonb NOT NULL,
  equity_after numeric NOT NULL,
  ledger_hash text NOT NULL UNIQUE,
  previous_state_hash text NOT NULL,
  state_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
REVOKE UPDATE, DELETE, TRUNCATE ON atlas_execution_events FROM PUBLIC;
""".strip()
