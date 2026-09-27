"""Crash-safe persistence for the hash-chained execution ledger."""

from __future__ import annotations

import datetime as dt
import json
import os
import secrets
from decimal import Decimal
from pathlib import Path
from typing import Any

from atlas.execution.ledger import ExecutionEvent, ExecutionLedger


class DurableExecutionLedgerStore:
    def __init__(self, path: Path):
        self.path = path

    def save(self, ledger: ExecutionLedger) -> None:
        ledger.verify_integrity()
        payload = {
            "version": 1,
            "checkpoint": list(ledger.head_checkpoint()),
            "events": [self._event_payload(e.event) for e in ledger.entries()],
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name("." + self.path.name + ".tmp-" + secrets.token_hex(8))
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, sort_keys=True, separators=(",", ":"))
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp, self.path)
            os.chmod(self.path, 0o600)
            dfd = os.open(self.path.parent, os.O_RDONLY)
            try:
                os.fsync(dfd)
            finally:
                os.close(dfd)
        finally:
            if tmp.exists():
                tmp.unlink()

    def load(self) -> ExecutionLedger:
        if not self.path.exists():
            return ExecutionLedger()
        if self.path.stat().st_mode & 0o077:
            raise RuntimeError("execution ledger permissions are too broad")
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            if raw.get("version") != 1 or not isinstance(raw.get("events"), list):
                raise ValueError("unsupported execution ledger format")
            ledger = ExecutionLedger()
            for item in raw["events"]:
                ledger.append(self._event_from_payload(item))
            cp = raw.get("checkpoint")
            if not isinstance(cp, list) or len(cp) != 2:
                raise ValueError("missing checkpoint")
            checkpoint = (int(cp[0]), str(cp[1]))
            if ledger.head_checkpoint() != checkpoint:
                raise ValueError("checkpoint mismatch")
            ledger.verify_integrity(checkpoint if checkpoint[0] >= 0 else None)
            return ledger
        except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
            raise RuntimeError("execution ledger is unreadable; refusing recovery") from exc

    @staticmethod
    def _event_payload(event: ExecutionEvent) -> dict[str, Any]:
        def dec(v: Decimal | None) -> str | None:
            return None if v is None else str(v)

        return {
            "event_id": event.event_id,
            "event_type": event.event_type,
            "event_time": event.event_time.isoformat(),
            "instrument_id": event.instrument_id,
            "quantity": event.quantity,
            "price": dec(event.price),
            "fee": str(event.fee),
            "cash": dec(event.cash),
            "equity": dec(event.equity),
            "decision_id": event.decision_id,
            "metadata": dict(event.metadata),
        }

    @staticmethod
    def _event_from_payload(raw: dict[str, Any]) -> ExecutionEvent:
        def dec(v: Any) -> Decimal | None:
            return None if v is None else Decimal(str(v))

        when = dt.datetime.fromisoformat(str(raw["event_time"]))
        if when.tzinfo is None or when.utcoffset() is None:
            raise ValueError("naive event time")
        return ExecutionEvent(
            str(raw["event_id"]),
            str(raw["event_type"]),
            when,
            raw.get("instrument_id"),
            raw.get("quantity"),
            dec(raw.get("price")),
            Decimal(str(raw.get("fee", "0"))),
            dec(raw.get("cash")),
            dec(raw.get("equity")),
            raw.get("decision_id"),
            raw.get("metadata") or {},
        )
