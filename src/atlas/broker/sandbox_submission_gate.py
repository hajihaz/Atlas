"""Durable at-most-once sandbox submission fence.

This is a conservative offline/sandbox component, not a production broker
outbox. Unknown outcomes are NEVER automatically retried after process restart.
"""

from __future__ import annotations

import hashlib
import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from atlas.broker.adapter import ApprovedOrder, BrokerOrderReceipt, BrokerOrderStatus
from atlas.broker.observation_journal import DurableOrderObservationJournal
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
        if self.path.is_symlink():
            raise RuntimeError("sandbox submission journal symlinks are forbidden")
        with self._connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS sandbox_intents ("
                "idempotency_key TEXT PRIMARY KEY, request_digest TEXT NOT NULL,"
                "state TEXT NOT NULL, broker_order_id TEXT)"
            )
            self._verify_layout(db)
        # This file contains order identities. No bearer credentials belong here.
        os.chmod(self.path, 0o600)

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        if self.path.is_symlink():
            raise RuntimeError("sandbox submission journal symlinks are forbidden")
        db = sqlite3.connect(self.path, timeout=8)
        try:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("PRAGMA synchronous=FULL")
            yield db
            if db.in_transaction:
                db.commit()
        except BaseException:
            if db.in_transaction:
                db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def _verify_layout(db: sqlite3.Connection) -> None:
        layout = db.execute("PRAGMA table_info(sandbox_intents)").fetchall()
        actual = [(row[1], row[2], row[5]) for row in layout]
        expected = [
            ("idempotency_key", "TEXT", 1),
            ("request_digest", "TEXT", 0),
            ("state", "TEXT", 0),
            ("broker_order_id", "TEXT", 0),
        ]
        if actual != expected:
            raise RuntimeError("unsafe sandbox submission journal schema")

    @staticmethod
    def _checked_row(row: tuple[str, str, str, str | None]) -> SandboxedSubmissionState:
        item = SandboxedSubmissionState(*row)
        if (
            not isinstance(item.idempotency_key, str)
            or not item.idempotency_key.strip()
            or not isinstance(item.request_digest, str)
            or len(item.request_digest) != 64
            or any(c not in "0123456789abcdef" for c in item.request_digest)
            or item.state not in {"pending", "accepted", "unknown"}
            or (
                item.state == "accepted"
                and (not isinstance(item.broker_order_id, str) or not item.broker_order_id.strip())
            )
            or (item.state != "accepted" and item.broker_order_id is not None)
        ):
            raise RuntimeError("invalid sandbox submission record; broker safety blocked")
        return item

    def observed(self, key: str) -> SandboxedSubmissionState | None:
        with self._connect() as db:
            row = db.execute(
                "SELECT idempotency_key,request_digest,state,broker_order_id "
                "FROM sandbox_intents WHERE idempotency_key=?",
                (key,),
            ).fetchone()
        if row is None:
            return None
        return self._checked_row(row)

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
            self._verify_layout(db)
            row = db.execute(
                "SELECT idempotency_key,request_digest,state,broker_order_id "
                "FROM sandbox_intents WHERE idempotency_key=?",
                (order.idempotency_key,),
            ).fetchone()
            if row:
                checked = self._checked_row(row)
                if checked.request_digest != digest:
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

    def verify_read_only_observations(
        self, key: str, observations: DurableOrderObservationJournal
    ) -> BrokerOrderStatus:
        """Reconcile separately captured observations; NEVER unlocks a new submit.

        The observations must come from an independently trusted broker-read
        authority. Local hashes alone do not authenticate the broker source.
        """
        own = self.observed(key)
        if own is None or own.state != "accepted" or not own.broker_order_id:
            raise RuntimeError(
                "submission has no confirmed broker identity; read-only recovery required"
            )
        observations.verify()
        matched = [event for event in observations.records() if event.client_order_id == key]
        if not matched:
            raise RuntimeError("broker order observation missing; reconciliation blocked")
        if any(event.broker_order_id != own.broker_order_id for event in matched):
            raise RuntimeError("broker observation differs from durable submission identity")
        return matched[-1].status
