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
from atlas.common.hashing import GENESIS_HASH, content_hash
from atlas.execution.ledger import ExecutionEvent, ExecutionLedger
from atlas.execution.production_persistence import DurableExecutionRecord
from atlas.execution.record_validation import verify_execution_records
from atlas.execution.simulator import Fill
from atlas.portfolio.account import PortfolioAccount, PortfolioState


@dataclass(frozen=True)
class JournalRecovery:
    account: PortfolioAccount
    ledger: ExecutionLedger
    applied_event_ids: frozenset[str]


class TransactionalExecutionJournal:
    """SQLite-backed exactly-once broker-observation journal for paper execution."""

    SCHEMA_VERSION = 1

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
                "CREATE TABLE IF NOT EXISTS journal_meta "
                "(key TEXT PRIMARY KEY, value TEXT NOT NULL)"
            )
            version = db.execute(
                "SELECT value FROM journal_meta WHERE key='schema_version'"
            ).fetchone()
            if version is None:
                db.execute(
                    "INSERT INTO journal_meta(key,value) VALUES('schema_version',?)",
                    (str(self.SCHEMA_VERSION),),
                )
            elif version[0] != str(self.SCHEMA_VERSION):
                raise RuntimeError(f"unsupported execution journal schema version: {version[0]}")
            db.execute(
                """CREATE TABLE IF NOT EXISTS execution_events (
                seq INTEGER PRIMARY KEY,
                event_id TEXT NOT NULL UNIQUE,
                event_json TEXT NOT NULL,
                cash_after TEXT NOT NULL,
                holdings_json TEXT NOT NULL,
                equity_after TEXT NOT NULL,
                chain_hash TEXT NOT NULL UNIQUE,
                prev_state_hash TEXT NOT NULL,
                state_hash TEXT NOT NULL UNIQUE
                )"""
            )

    @staticmethod
    def _verify_persisted_rows(db: sqlite3.Connection) -> dict[str, dict[str, object]]:
        rows = db.execute(
            "SELECT seq,event_id,event_json,cash_after,holdings_json,equity_after,"
            "chain_hash,prev_state_hash,state_hash FROM execution_events ORDER BY seq"
        ).fetchall()
        records = tuple(
            DurableExecutionRecord(
                int(row[0]),
                str(row[1]),
                str(row[2]),
                Decimal(str(row[3])),
                str(row[4]),
                Decimal(str(row[5])),
                str(row[6]),
                str(row[7]),
                str(row[8]),
            )
            for row in rows
        )
        verify_execution_records(records)
        return {record.event_id: json.loads(record.event_json) for record in records}

    @staticmethod
    def _assert_exact_replay(
        existing: dict[str, object],
        *,
        fill: BrokerFill,
        event_id: str,
        side: str,
        event_time: dt.datetime,
    ) -> None:
        expected_quantity = fill.quantity if side == "BUY" else -fill.quantity
        metadata = existing.get("metadata")
        match = (
            existing.get("event_id") == event_id
            and existing.get("event_type") == "broker_fill"
            and existing.get("event_time") == event_time.isoformat()
            and existing.get("instrument_id") == fill.instrument_id
            and existing.get("quantity") == expected_quantity
            and Decimal(str(existing.get("price"))) == fill.fill_price
            and Decimal(str(existing.get("fee"))) == fill.fee
            and metadata == {"broker_order_id": fill.broker_order_id, "side": side}
        )
        if not match:
            raise RuntimeError("conflicting replay for durable execution event")

    @staticmethod
    def _assert_live_state_matches_journal(
        db: sqlite3.Connection,
        *,
        account: PortfolioAccount,
        ledger: ExecutionLedger,
    ) -> None:
        """Prevent a stale or substituted caller state from crossing a commit boundary."""
        last = db.execute(
            "SELECT seq,cash_after,holdings_json,equity_after,chain_hash "
            "FROM execution_events ORDER BY seq DESC LIMIT 1"
        ).fetchone()
        expected_checkpoint = (
            (int(last[0]), str(last[4])) if last is not None else (-1, GENESIS_HASH)
        )
        if ledger.head_checkpoint() != expected_checkpoint:
            raise RuntimeError("journal/ledger checkpoint divergence")
        if last is None:
            if account.state.holdings or account.state.equity != account.state.cash:
                raise RuntimeError("unjournaled initial portfolio state")
            return
        holdings = {k: int(v) for k, v in json.loads(last[2]).items()}
        if (
            account.state.cash != Decimal(str(last[1]))
            or dict(account.state.holdings) != holdings
            or account.state.equity != Decimal(str(last[3]))
        ):
            raise RuntimeError("stale portfolio state does not match committed journal")

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
        if not event_id:
            raise ValueError("broker fill event_id is required")
        if side not in {"BUY", "SELL"}:
            raise ValueError("side must be BUY or SELL")
        if event_time.tzinfo is None or event_time.utcoffset() is None:
            raise ValueError("event_time must be timezone-aware")
        with self._connect() as db:
            observed = self._verify_persisted_rows(db)
            if event_id in observed:
                self._assert_exact_replay(
                    observed[event_id],
                    fill=fill,
                    event_id=event_id,
                    side=side,
                    event_time=event_time,
                )
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
        state_payload = {
            "cash": str(transition.cash_after),
            "holdings": dict(sorted(staged_account.state.holdings.items())),
            "equity": str(transition.equity_after),
            "event_id": event_id,
        }
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            observed = self._verify_persisted_rows(db)
            if event_id in observed:
                self._assert_exact_replay(
                    observed[event_id],
                    fill=fill,
                    event_id=event_id,
                    side=side,
                    event_time=event_time,
                )
                db.rollback()
                return False
            self._assert_live_state_matches_journal(
                db, account=account, ledger=ledger
            )
            expected_seq = len(observed)
            if expected_seq != staged_entry.seq:
                db.rollback()
                raise RuntimeError("journal/ledger sequence divergence")
            previous = db.execute(
                "SELECT state_hash FROM execution_events ORDER BY seq DESC LIMIT 1"
            ).fetchone()
            prev_state_hash = previous[0] if previous else GENESIS_HASH
            state_hash = content_hash({"prev": prev_state_hash, "state": state_payload})
            db.execute(
                "INSERT INTO execution_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    staged_entry.seq,
                    event_id,
                    payload,
                    str(transition.cash_after),
                    holdings,
                    str(transition.equity_after),
                    staged_entry.chain_hash,
                    prev_state_hash,
                    state_hash,
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
                "SELECT seq,event_id,event_json,cash_after,holdings_json,equity_after,chain_hash,"
                "prev_state_hash,state_hash FROM execution_events ORDER BY seq"
            ).fetchall()
        previous_state_hash = GENESIS_HASH
        for expected_seq, row in enumerate(rows):
            (
                seq,
                event_id,
                event_json,
                cash_after,
                holdings_json,
                equity_after,
                chain_hash,
                prev_state_hash,
                state_hash,
            ) = row
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
            if event.cash != state.cash or event.equity != state.equity:
                raise RuntimeError("journal event/account state divergence")
            if (
                event.event_type != "broker_fill"
                or not event.instrument_id
                or not isinstance(event.quantity, int)
                or event.quantity == 0
                or event.price is None
            ):
                raise RuntimeError("invalid persisted broker fill")
            expected_cash = (
                account.state.cash - Decimal(event.quantity) * event.price - event.fee
            )
            expected_holdings = dict(account.state.holdings)
            new_quantity = expected_holdings.get(event.instrument_id, 0) + event.quantity
            if new_quantity < 0:
                raise RuntimeError("journal fill exceeds recorded holdings")
            if new_quantity:
                expected_holdings[event.instrument_id] = new_quantity
            else:
                expected_holdings.pop(event.instrument_id, None)
            if state.cash != expected_cash or state.holdings != expected_holdings:
                raise RuntimeError("journal fill/account transition divergence")
            state_payload = {
                "cash": str(state.cash),
                "holdings": dict(sorted(state.holdings.items())),
                "equity": str(state.equity),
                "event_id": event_id,
            }
            expected_state_hash = content_hash(
                {"prev": previous_state_hash, "state": state_payload}
            )
            if prev_state_hash != previous_state_hash or state_hash != expected_state_hash:
                raise RuntimeError("journal account-state chain integrity failure")
            previous_state_hash = state_hash
            account = PortfolioAccount(
                cash=state.cash, holdings=state.holdings, equity=state.equity
            )
            applied.add(event_id)
        return JournalRecovery(account, ledger, frozenset(applied))
