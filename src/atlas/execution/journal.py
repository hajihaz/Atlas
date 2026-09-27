"""Transactional local journal coupling broker observation, accounting and ledger state.

The journal has no network/order authority. SQLite provides one durable commit boundary so a
crash cannot persist an idempotency marker without the matching account and ledger checkpoint.
"""

from __future__ import annotations

import datetime as dt
import json
import sqlite3
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

from atlas.broker.adapter import BrokerFill
from atlas.execution.ledger import ExecutionEvent, ExecutionLedger
from atlas.execution.simulator import Fill
from atlas.portfolio.account import PortfolioAccount, PortfolioState


@dataclass(frozen=True)
class JournalRecovery:
    account: PortfolioAccount
    ledger: ExecutionLedger
    applied_event_ids: frozenset[str]


class TransactionalExecutionJournal:
    """SQLite-backed exactly-once broker-observation journal for paper execution."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=FULL")
        return connection

    def _initialize(self) -> None:
        with self._connect() as db:
            db.execute(
                """CREATE TABLE IF NOT EXISTS execution_events (
                seq INTEGER PRIMARY KEY,
                event_id TEXT NOT NULL UNIQUE,
                event_json TEXT NOT NULL,
                cash_after TEXT NOT NULL,
                holdings_json TEXT NOT NULL,
                equity_after TEXT NOT NULL,
                chain_hash TEXT NOT NULL UNIQUE
                )"""
            )

    def apply_broker_fill(
        self,
        *,
        account: PortfolioAccount,
        ledger: ExecutionLedger,
        fill: BrokerFill,
        event_id: str,
        side: str,
        valuation_prices: Mapping[str, Decimal],
        event_time: dt.datetime,
    ) -> bool:
        """Commit one observation exactly once, then mirror the committed state in memory."""
        if side not in {"BUY", "SELL"}:
            raise ValueError("side must be BUY or SELL")
        if event_time.tzinfo is None or event_time.utcoffset() is None:
            raise ValueError("event_time must be timezone-aware")
        with self._connect() as db:
            if db.execute(
                "SELECT 1 FROM execution_events WHERE event_id = ?", (event_id,)
            ).fetchone():
                return False

        signed = fill.quantity if side == "BUY" else -fill.quantity
        accounting_fill = Fill(fill.instrument_id, signed, fill.fill_price, fill.fee)
        staged_account = PortfolioAccount(
            cash=account.state.cash,
            holdings=account.state.holdings,
            equity=account.state.equity,
        )
        transition = staged_account.apply_fill(
            accounting_fill, event_id=event_id, valuation_prices=valuation_prices
        )
        staged_ledger = ExecutionLedger()
        for entry in ledger.entries():
            staged_ledger.append(entry.event)
        event = ExecutionEvent(
            event_id,
            "broker_fill",
            event_time,
            fill.instrument_id,
            signed,
            fill.fill_price,
            fill.fee,
            transition.cash_after,
            transition.equity_after,
            metadata={"broker_order_id": fill.broker_order_id, "side": side},
        )
        staged_entry = staged_ledger.append(event)

        payload = json.dumps(event.to_dict(), default=str, sort_keys=True, separators=(",", ":"))
        holdings = json.dumps(
            dict(sorted(staged_account.state.holdings.items())), separators=(",", ":")
        )
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute(
                "SELECT 1 FROM execution_events WHERE event_id = ?", (event_id,)
            ).fetchone():
                db.rollback()
                return False
            expected_seq = db.execute("SELECT COUNT(*) FROM execution_events").fetchone()[0]
            if expected_seq != staged_entry.seq:
                db.rollback()
                raise RuntimeError("journal/ledger sequence divergence")
            db.execute(
                "INSERT INTO execution_events VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    staged_entry.seq,
                    event_id,
                    payload,
                    str(transition.cash_after),
                    holdings,
                    str(transition.equity_after),
                    staged_entry.chain_hash,
                ),
            )
            db.commit()

        account.apply_fill(accounting_fill, event_id=event_id, valuation_prices=valuation_prices)
        ledger.append(event)
        return True

    def recover(self, *, initial_cash: Decimal) -> JournalRecovery:
        account = PortfolioAccount(cash=initial_cash)
        ledger = ExecutionLedger()
        applied: set[str] = set()
        with self._connect() as db:
            rows = db.execute(
                "SELECT seq,event_id,event_json,cash_after,holdings_json,equity_after,chain_hash "
                "FROM execution_events ORDER BY seq"
            ).fetchall()
        for expected_seq, row in enumerate(rows):
            seq, event_id, event_json, cash_after, holdings_json, equity_after, chain_hash = row
            if seq != expected_seq:
                raise RuntimeError("journal sequence gap")
            raw = json.loads(event_json)
            event = ExecutionEvent(
                raw["event_id"],
                raw["event_type"],
                dt.datetime.fromisoformat(raw["event_time"]),
                raw.get("instrument_id"),
                raw.get("quantity"),
                Decimal(raw["price"]) if raw.get("price") is not None else None,
                Decimal(raw.get("fee", "0")),
                Decimal(raw["cash"]) if raw.get("cash") is not None else None,
                Decimal(raw["equity"]) if raw.get("equity") is not None else None,
                raw.get("decision_id"),
                raw.get("metadata") or {},
            )
            entry = ledger.append(event)
            if entry.chain_hash != chain_hash:
                raise RuntimeError("journal ledger integrity failure")
            holdings = {k: int(v) for k, v in json.loads(holdings_json).items()}
            state = PortfolioState(Decimal(cash_after), holdings, Decimal(equity_after))
            state.validate()
            account = PortfolioAccount(
                cash=state.cash, holdings=state.holdings, equity=state.equity
            )
            applied.add(event_id)
        return JournalRecovery(account, ledger, frozenset(applied))
