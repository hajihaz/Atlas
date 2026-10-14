"""Validate persisted broker execution records independently of the database provider."""

from __future__ import annotations

import datetime as dt
import json
from decimal import Decimal, InvalidOperation
from typing import Any

from atlas.common.hashing import GENESIS_HASH, content_hash
from atlas.execution.ledger import ExecutionEvent, ExecutionLedger
from atlas.execution.production_persistence import DurableExecutionRecord


def canonical_document(raw: str) -> Any:
    try:
        return json.loads(raw)
    except (TypeError, ValueError) as exc:
        raise RuntimeError("unreadable execution JSON document") from exc


def verify_execution_records(records: tuple[DurableExecutionRecord, ...]) -> None:
    """Replay both hash chains and cash/position transitions; fail closed on divergence."""
    ledger = ExecutionLedger()
    previous_state_hash = GENESIS_HASH
    previous_cash: Decimal | None = None
    positions: dict[str, int] = {}
    for seq, record in enumerate(records):
        record.validate()
        if record.sequence != seq:
            raise RuntimeError("execution sequence gap")
        try:
            raw = canonical_document(record.event_json)
            holdings_raw = canonical_document(record.holdings_json)
            if not isinstance(raw, dict) or not isinstance(holdings_raw, dict):
                raise ValueError("execution payload is not an object")
            when = dt.datetime.fromisoformat(raw["event_time"])
            qty = raw["quantity"]
            instrument = raw["instrument_id"]
            if not isinstance(qty, int) or isinstance(qty, bool) or qty == 0:
                raise ValueError("invalid broker fill quantity")
            if not isinstance(instrument, str) or not instrument:
                raise ValueError("invalid fill instrument")
            price = Decimal(str(raw["price"]))
            fee = Decimal(str(raw["fee"]))
            event = ExecutionEvent(
                raw["event_id"],
                raw["event_type"],
                when,
                instrument,
                qty,
                price,
                fee,
                Decimal(str(raw["cash"])),
                Decimal(str(raw["equity"])),
                raw.get("decision_id"),
                raw.get("metadata") or {},
            )
            if event.event_type != "broker_fill" or event.event_id != record.event_id:
                raise ValueError("event identity/type mismatch")
            if (event.metadata.get("side") == "BUY") != (qty > 0):
                raise ValueError("fill side and quantity disagree")
            entry = ledger.append(event)
            if record.ledger_hash != entry.chain_hash:
                raise RuntimeError("execution ledger chain mismatch")
            holdings = {}
            for key, value in holdings_raw.items():
                if (
                    not isinstance(key, str)
                    or not isinstance(value, int)
                    or isinstance(value, bool)
                ):
                    raise ValueError("invalid holding")
                if value < 0:
                    raise ValueError("short positions are not allowed")
                holdings[key] = value
            positions[instrument] = positions.get(instrument, 0) + qty
            if positions[instrument] < 0:
                raise ValueError("negative broker position")
            if {k: v for k, v in holdings.items() if v != 0} != {
                k: v for k, v in positions.items() if v != 0
            }:
                raise RuntimeError("execution holding transition mismatch")
            if previous_cash is not None and (
                previous_cash - price * qty - fee != record.cash_after
            ):
                raise RuntimeError("execution cash transition mismatch")
            if event.cash != record.cash_after or event.equity != record.equity_after:
                raise RuntimeError("execution event and state disagree")
            state_payload = {
                "cash": str(record.cash_after),
                "holdings": dict(sorted(holdings.items())),
                "equity": str(record.equity_after),
                "event_id": record.event_id,
            }
            expected = content_hash({"prev": previous_state_hash, "state": state_payload})
            if record.previous_state_hash != previous_state_hash or record.state_hash != expected:
                raise RuntimeError("execution account-state chain mismatch")
        except (KeyError, TypeError, ValueError, InvalidOperation) as exc:
            raise RuntimeError("invalid persisted execution record") from exc
        previous_state_hash = record.state_hash
        previous_cash = record.cash_after
    ledger.verify_integrity()
