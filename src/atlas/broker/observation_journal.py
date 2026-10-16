"""Offline durable observed-order lifecycle journal.

Records untrusted broker facts; never submits or authorizes orders. A separate
execution and reconciliation authority must independently verify all observations.
"""

from __future__ import annotations

import datetime as dt
import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from atlas.broker.adapter import BrokerOrderStatus
from atlas.broker.state_machine import validate_transition
from atlas.common.hashing import GENESIS_HASH, canonical_json, chain_hash, content_hash


@dataclass(frozen=True)
class BrokerOrderObservation:
    event_id: str
    broker_order_id: str
    client_order_id: str
    status: BrokerOrderStatus
    cumulative_filled: int
    requested_quantity: int
    observed_at: dt.datetime

    def validate(self) -> None:
        if not all((self.event_id, self.broker_order_id, self.client_order_id)):
            raise ValueError("broker observation identities required")
        if self.observed_at.tzinfo is None or self.observed_at.utcoffset() is None:
            raise ValueError("broker observation must have timezone-aware timestamp")
        if type(self.cumulative_filled) is not int or type(self.requested_quantity) is not int:
            raise ValueError("broker observation quantities must be integers")
        if (
            not 0 <= self.cumulative_filled <= self.requested_quantity
            or self.requested_quantity <= 0
        ):
            raise ValueError("invalid broker cumulative fill quantity")
        if self.status == BrokerOrderStatus.UNKNOWN:
            raise RuntimeError("unknown broker order state blocks reconciliation")
        if (
            self.status in {BrokerOrderStatus.ACCEPTED, BrokerOrderStatus.REJECTED}
            and self.cumulative_filled
        ):
            raise RuntimeError("unfilled broker order state has nonzero fills")
        if (
            self.status == BrokerOrderStatus.FILLED
            and self.cumulative_filled != self.requested_quantity
        ):
            raise RuntimeError("broker filled status disagrees with cumulative quantity")
        if self.status == BrokerOrderStatus.PARTIALLY_FILLED and not (
            0 < self.cumulative_filled < self.requested_quantity
        ):
            raise RuntimeError("broker partial fill status disagrees with cumulative quantity")

    def to_dict(self) -> dict[str, str | int]:
        self.validate()
        return {
            "event_id": self.event_id,
            "broker_order_id": self.broker_order_id,
            "client_order_id": self.client_order_id,
            "status": self.status.value,
            "cumulative_filled": self.cumulative_filled,
            "requested_quantity": self.requested_quantity,
            "observed_at": self.observed_at.astimezone(dt.UTC).isoformat(),
        }

    @classmethod
    def from_dict(cls, body: dict[str, object]) -> BrokerOrderObservation:
        try:
            if set(body) != {
                "event_id",
                "broker_order_id",
                "client_order_id",
                "status",
                "cumulative_filled",
                "requested_quantity",
                "observed_at",
            }:
                raise ValueError("unexpected broker observation fields")
            status = body["status"]
            timestamp = body["observed_at"]
            if not isinstance(status, str) or not isinstance(timestamp, str):
                raise ValueError("bad broker observation enum or timestamp")
            observation = cls(
                str(body["event_id"]),
                str(body["broker_order_id"]),
                str(body["client_order_id"]),
                BrokerOrderStatus(status),
                body["cumulative_filled"],  # type: ignore[arg-type]
                body["requested_quantity"],  # type: ignore[arg-type]
                dt.datetime.fromisoformat(timestamp),
            )
            observation.validate()
            return observation
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError("invalid persisted broker order observation") from exc


class DurableOrderObservationJournal:
    """Serialized SQLite WAL journal; complete replay verification on every operation."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS broker_order_observations("
                "seq INTEGER PRIMARY KEY, event_id TEXT UNIQUE NOT NULL,"
                "payload TEXT NOT NULL, previous_hash TEXT NOT NULL, chain_hash TEXT NOT NULL)"
            )

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
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
    def _check_transition(
        prior: BrokerOrderObservation | None, current: BrokerOrderObservation
    ) -> None:
        current.validate()
        if prior is None:
            validate_transition(BrokerOrderStatus.UNKNOWN, current.status)
            return
        if (
            prior.broker_order_id != current.broker_order_id
            or prior.client_order_id != current.client_order_id
            or prior.requested_quantity != current.requested_quantity
        ):
            raise RuntimeError("broker order identity/quantity changed")
        if current.observed_at < prior.observed_at:
            raise RuntimeError("broker observation time regressed")
        if current.cumulative_filled < prior.cumulative_filled:
            raise RuntimeError("broker cumulative fill count regressed")
        validate_transition(prior.status, current.status)

    @classmethod
    def _read_verified(cls, db: sqlite3.Connection) -> tuple[BrokerOrderObservation, ...]:
        previous_hash = GENESIS_HASH
        result: list[BrokerOrderObservation] = []
        most_recent: dict[str, BrokerOrderObservation] = {}
        event_ids: set[str] = set()
        # Client idempotency tags are unique per broker order. A forged second
        # broker ID with the same client key must not bypass recovery checks.
        client_orders: dict[str, str] = {}
        rows = db.execute(
            "SELECT seq,event_id,payload,previous_hash,chain_hash "
            "FROM broker_order_observations ORDER BY seq"
        ).fetchall()
        for index, (seq, event_id, payload, prior_hash, observed_hash) in enumerate(rows):
            if type(seq) is not int or seq != index or prior_hash != previous_hash:
                raise RuntimeError("broker journal sequence/hash divergence")
            try:
                body = json.loads(payload)
            except (ValueError, TypeError) as exc:
                raise RuntimeError("unreadable broker journal payload") from exc
            if not isinstance(body, dict):
                raise RuntimeError("invalid broker journal payload")
            observation = BrokerOrderObservation.from_dict(body)
            expected_hash = chain_hash(previous_hash, content_hash(body))
            if (
                event_id != observation.event_id
                or event_id in event_ids
                or canonical_json(body) != payload
                or observed_hash != expected_hash
            ):
                raise RuntimeError("broker observation journal integrity failure")
            existing_broker = client_orders.get(observation.client_order_id)
            if existing_broker is not None and existing_broker != observation.broker_order_id:
                raise RuntimeError("conflicting broker ID for client idempotency key")
            cls._check_transition(most_recent.get(observation.broker_order_id), observation)
            client_orders[observation.client_order_id] = observation.broker_order_id
            most_recent[observation.broker_order_id] = observation
            event_ids.add(event_id)
            previous_hash = expected_hash
            result.append(observation)
        return tuple(result)

    def records(self) -> tuple[BrokerOrderObservation, ...]:
        with self._connect() as db:
            return self._read_verified(db)

    def append(self, observation: BrokerOrderObservation) -> bool:
        observation.validate()
        payload = canonical_json(observation.to_dict())
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = self._read_verified(db)
            seen = {item.event_id: item for item in existing}
            if observation.event_id in seen:
                if seen[observation.event_id].to_dict() != observation.to_dict():
                    raise RuntimeError("conflicting broker observation replay")
                return False
            latest = next(
                (
                    item
                    for item in reversed(existing)
                    if item.broker_order_id == observation.broker_order_id
                ),
                None,
            )
            client_match = next(
                (item for item in existing if item.client_order_id == observation.client_order_id),
                None,
            )
            if (
                client_match is not None
                and client_match.broker_order_id != observation.broker_order_id
            ):
                raise RuntimeError("conflicting broker ID for client idempotency key")
            self._check_transition(latest, observation)
            old_chain = GENESIS_HASH
            if existing:
                row = db.execute(
                    "SELECT chain_hash FROM broker_order_observations ORDER BY seq DESC LIMIT 1"
                ).fetchone()
                if row is None:
                    raise RuntimeError("broker journal head absent")
                old_chain = str(row[0])
            new_hash = chain_hash(old_chain, content_hash(observation.to_dict()))
            db.execute(
                "INSERT INTO broker_order_observations VALUES (?,?,?,?,?)",
                (len(existing), observation.event_id, payload, old_chain, new_hash),
            )
            db.commit()
            return True

    def verify(self) -> str:
        with self._connect() as db:
            self._read_verified(db)
            row = db.execute(
                "SELECT chain_hash FROM broker_order_observations ORDER BY seq DESC LIMIT 1"
            ).fetchone()
            return str(row[0]) if row else GENESIS_HASH
