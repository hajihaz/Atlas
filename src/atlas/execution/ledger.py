"""Immutable execution event ledger for simulation and future broker reconciliation."""

from __future__ import annotations

import datetime as _dt
from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from atlas.common.hashing import GENESIS_HASH, chain_hash, content_hash


@dataclass(frozen=True)
class ExecutionEvent:
    """One append-only execution event; event payloads are immutable by convention."""

    event_id: str
    event_type: str
    event_time: _dt.datetime
    instrument_id: str | None = None
    quantity: int | None = None
    price: Decimal | None = None
    fee: Decimal = Decimal("0")
    cash: Decimal | None = None
    equity: Decimal | None = None
    decision_id: str | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "event_time": self.event_time.isoformat(),
            "instrument_id": self.instrument_id,
            "quantity": self.quantity,
            "price": self.price,
            "fee": self.fee,
            "cash": self.cash,
            "equity": self.equity,
            "decision_id": self.decision_id,
            "metadata": dict(self.metadata),
        }


@dataclass(frozen=True)
class ExecutionLedgerEntry:
    seq: int
    event: ExecutionEvent
    event_hash: str
    prev_hash: str
    chain_hash: str


class ExecutionLedger:
    """In-memory append-only, hash-chained execution journal.

    It deliberately has no broker methods. A future live adapter must append observed broker
    events and reconcile them; it must not gain authority to create orders through this ledger.
    """

    def __init__(self) -> None:
        self._entries: list[ExecutionLedgerEntry] = []

    def append(self, event: ExecutionEvent) -> ExecutionLedgerEntry:
        if event.event_id == "" or event.event_type == "":
            raise ValueError("event_id and event_type are required")
        if event.event_time.tzinfo is None or event.event_time.utcoffset() is None:
            raise ValueError("event_time must be timezone-aware")
        if event.quantity is not None and event.quantity == 0:
            raise ValueError("quantity cannot be zero")
        if event.price is not None and event.price <= 0:
            raise ValueError("price must be positive")
        if event.fee < 0:
            raise ValueError("fee cannot be negative")
        prev = self._entries[-1].chain_hash if self._entries else GENESIS_HASH
        rec_hash = content_hash(event.to_dict())
        chained = chain_hash(prev, rec_hash)
        entry = ExecutionLedgerEntry(len(self._entries), event, rec_hash, prev, chained)
        self._entries.append(entry)
        return entry

    def entries(self) -> tuple[ExecutionLedgerEntry, ...]:
        return tuple(self._entries)

    def head_checkpoint(self) -> tuple[int, str]:
        if not self._entries:
            return (-1, GENESIS_HASH)
        e = self._entries[-1]
        return (e.seq, e.chain_hash)

    def verify_integrity(self, checkpoint: tuple[int, str] | None = None) -> None:
        prev = GENESIS_HASH
        for i, entry in enumerate(self._entries):
            if entry.seq != i:
                raise ValueError(f"non-monotonic execution sequence at {i}")
            expected_record = content_hash(entry.event.to_dict())
            if expected_record != entry.event_hash:
                raise ValueError(f"execution event altered at seq {i}")
            if entry.prev_hash != prev:
                raise ValueError(f"execution chain broken at seq {i}")
            expected_chain = chain_hash(prev, expected_record)
            if entry.chain_hash != expected_chain:
                raise ValueError(f"execution chain hash mismatch at seq {i}")
            prev = entry.chain_hash
        if checkpoint is not None:
            seq, expected = checkpoint
            if len(self._entries) <= seq or self._entries[seq].chain_hash != expected:
                raise ValueError("execution ledger diverges from checkpoint")
