"""Durable at-most-once sandbox submission fence.

This is a conservative offline/sandbox component, not a production broker
outbox. Unknown outcomes are NEVER automatically retried after process restart.
"""

from __future__ import annotations

import hashlib
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from atlas.broker.adapter import ApprovedOrder, BrokerOrderReceipt, BrokerOrderStatus
from atlas.broker.upstox_sandbox import UpstoxSandboxAdapter
from atlas.common.hashing import canonical_json
from atlas.health import HealthReport, assert_operational_clear
from atlas.operations_hardening import DurableEmergencyStore


@dataclass(frozen=True)
class SandboxedSubmissionState:
    idempotency_key: str
    request_digest: str
    state: str
    broker_order_id: str | None


def _digest_order(order: ApprovedOrder) -> str:
    order.validate()
    if not order.idempotency_key.strip():
        raise ValueError("sandbox order requires idempotency key")
    if order.side is None:
        raise ValueError("sandbox order side required")
    body = {
        "instrument_id": order.instrument_id,
        "quantity": order.quantity,
        "side": order.side.value,
        "limit_price": str(order.limit_price) if order.limit_price is not None else None,
        "approval_id": order.approval_id,
        "idempotency_key": order.idempotency_key,
    }
    return hashlib.sha256(canonical_json(body).encode()).hexdigest()


class SandboxAtMostOnceGate:
    """Persist intent before transport call; failure keeps a no-retry fence."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS sandbox_intents ("
                "idempotency_key TEXT PRIMARY KEY, request_digest TEXT NOT NULL,"
                "state TEXT NOT NULL, broker_order_id TEXT)"
            )

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, timeout=8)
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=FULL")
        return db

    def observed(self, key: str) -> SandboxedSubmissionState | None:
        with self._connect() as db:
            row = db.execute(
                "SELECT idempotency_key,request_digest,state,broker_order_id "
                "FROM sandbox_intents WHERE idempotency_key=?",
                (key,),
            ).fetchone()
        if row is None:
            return None
        item = SandboxedSubmissionState(*row)
        if item.state not in {"pending", "accepted", "unknown"}:
            raise RuntimeError("invalid sandbox submission state; broker safety blocked")
        return item

    def submit_once(
        self,
        adapter: UpstoxSandboxAdapter,
        order: ApprovedOrder,
        *,
        emergency_store: DurableEmergencyStore | None = None,
        health: HealthReport | None = None,
    ) -> BrokerOrderReceipt:
        # A non-engaged *missing* emergency file is not operational evidence.
        if emergency_store is None or not emergency_store.path.is_file() or health is None:
            raise RuntimeError("mandatory persisted emergency and health proofs unavailable")
        assert_operational_clear(emergency_store, health, require_proofs=True)
        digest = _digest_order(order)
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT request_digest FROM sandbox_intents WHERE idempotency_key=?",
                (order.idempotency_key,),
            ).fetchone()
            if row:
                if row[0] != digest:
                    raise RuntimeError("conflicting sandbox idempotency key replay")
                raise RuntimeError(
                    "sandbox submission already attempted; reconcile by broker read-only "
                    "status before any new instruction"
                )
            db.execute(
                "INSERT INTO sandbox_intents VALUES (?,?,?,NULL)",
                (order.idempotency_key, digest, "pending"),
            )
            db.commit()

        try:
            receipt = adapter.submit(order)
        except Exception as exc:
            self._record_observation(order.idempotency_key, digest, "unknown", None)
            raise RuntimeError(
                "ambiguous sandbox transport result: do not retry automatically"
            ) from exc
        if receipt.status != BrokerOrderStatus.ACCEPTED or not receipt.broker_order_id:
            self._record_observation(order.idempotency_key, digest, "unknown", None)
            raise RuntimeError("sandbox broker order not confirmed: reconciliation required")
        self._record_observation(order.idempotency_key, digest, "accepted", receipt.broker_order_id)
        return receipt

    def _record_observation(self, key: str, digest: str, state: str, broker_id: str | None) -> None:
        if state not in {"accepted", "unknown"}:
            raise RuntimeError("unsupported sandbox submission outcome")
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            updated = db.execute(
                "UPDATE sandbox_intents SET state=?,broker_order_id=? "
                "WHERE idempotency_key=? AND request_digest=? AND state='pending'",
                (state, broker_id, key, digest),
            )
            if updated.rowcount != 1:
                raise RuntimeError("sandbox submission intent divergence")
            db.commit()
