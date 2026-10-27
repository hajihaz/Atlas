"""Owner-controlled, durable NSE paper scheduler. No broker imports or real orders.

Single SQLite database on a *persistent volume*; BEGIN IMMEDIATE serializes
competing server/worker instances. Source-stamped, NSE-open quotes are required
for all simulated fills. A missing or late source always means NO FILL.
"""

from __future__ import annotations

import datetime as dt
import re
import sqlite3
import uuid
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")
UTC = dt.timezone.utc  # noqa: UP017 - also runs local Python 3.9 test harness
SYMBOL = re.compile(r"^[A-Z][A-Z0-9&-]{0,29}$")
STALE_SECONDS = 15
MAX_DELAY_SECONDS = 45
FEE_BPS = 10  # Assumed paper fee, not actual brokerage.
SLIPPAGE_BPS = 5  # Conservative model for paper buy/sell price impact.
INIT_CAPITAL = 100_000_00  # paise


class OrderError(ValueError):
    pass


def utc_now() -> dt.datetime:
    return dt.datetime.now(UTC)


def to_iso(value: dt.datetime) -> str:
    if value.tzinfo is None:
        raise OrderError("timezone-aware timestamp required")
    return value.astimezone(UTC).isoformat(timespec="microseconds")


def valid_session(value: dt.datetime) -> bool:
    local = value.astimezone(IST)
    return local.weekday() < 5 and dt.time(9, 15) <= local.time() < dt.time(15, 30)


def parse_time(raw: str | None) -> dt.datetime:
    try:
        if not isinstance(raw, str):
            raise ValueError("timestamp must be a string")
        value = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if value.utcoffset() is None:
            raise ValueError("missing offset")
        return value.astimezone(UTC)
    except (ValueError, TypeError, AttributeError) as exc:
        raise OrderError("scheduled_at requires ISO-8601 timestamp with offset") from exc


def validate_symbol(value: object) -> str:
    if not isinstance(value, str) or not SYMBOL.fullmatch(value):
        raise OrderError("invalid NSE stock symbol")
    return value


class CloudPaperEngine:
    def __init__(self, path: str):
        if not path:
            raise RuntimeError("ATLAS_PAPER_DB_PATH must point to durable storage")
        self.path = path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _db(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout=15000")
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA journal_mode=WAL")
        return db

    def _init(self) -> None:
        with self._db() as db:
            db.executescript("""
             CREATE TABLE IF NOT EXISTS orders (
               id TEXT PRIMARY KEY, client_key TEXT UNIQUE NOT NULL,
               kind TEXT NOT NULL, symbol TEXT NOT NULL, side TEXT NOT NULL,
               qty INTEGER NOT NULL CHECK(qty>0), due_at TEXT NOT NULL,
               status TEXT NOT NULL DEFAULT 'QUEUED', fill_paise INTEGER,
               fee_paise INTEGER, completed_at TEXT, reason TEXT,
               created_at TEXT NOT NULL);
             CREATE INDEX IF NOT EXISTS ix_orders_pending ON orders(status,due_at);
             CREATE TABLE IF NOT EXISTS quotes (
               symbol TEXT PRIMARY KEY, price_paise INTEGER NOT NULL,
               cumulative_volume INTEGER NOT NULL, observed_at TEXT NOT NULL,
               source TEXT NOT NULL, exchange_open INTEGER NOT NULL);
             CREATE TABLE IF NOT EXISTS coverage (
               session TEXT PRIMARY KEY, count INTEGER NOT NULL, observed_at TEXT NOT NULL,
               source TEXT NOT NULL,nifty_change_bps INTEGER);
             CREATE TABLE IF NOT EXISTS positions (
               symbol TEXT PRIMARY KEY, qty INTEGER NOT NULL,
               entry_paise INTEGER,intraday INTEGER NOT NULL DEFAULT 0);
             CREATE TABLE IF NOT EXISTS settings (
               key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS runs (
               session TEXT NOT NULL, phase TEXT NOT NULL, status TEXT NOT NULL,
               reason TEXT, completed_at TEXT NOT NULL,
               PRIMARY KEY(session,phase));
             CREATE TABLE IF NOT EXISTS events (
               id INTEGER PRIMARY KEY AUTOINCREMENT, observed_at TEXT NOT NULL,
               type TEXT NOT NULL, message TEXT NOT NULL);
            """)
            db.execute(
                "INSERT OR IGNORE INTO settings(key,value) VALUES('cash_paise',?)",
                (str(INIT_CAPITAL),),
            )
            db.execute("INSERT OR IGNORE INTO settings(key,value) VALUES('strategy_enabled','0')")

    @staticmethod
    def _event(db: sqlite3.Connection, now: dt.datetime, kind: str, message: str) -> None:
        db.execute(
            "INSERT INTO events(observed_at,type,message) VALUES(?,?,?)",
            (to_iso(now), kind, message[:300]),
        )

    def set_strategy(self, enabled: bool, now: dt.datetime | None = None) -> dict[str, Any]:
        now = now or utc_now()
        with self._db() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute(
                "UPDATE settings SET value=? WHERE key='strategy_enabled'",
                ("1" if enabled else "0",),
            )
            self._event(db, now, "STRATEGY", "Enabled" if enabled else "Disabled")
        return {
            "enabled": enabled,
            "strategy": "NSE_TOP_VOLUME_0940_EXIT_1515",
            "realOrdersEnabled": False,
        }

    def schedule(self, data: dict[str, Any], now: dt.datetime | None = None) -> dict[str, Any]:
        now = now or utc_now()
        if not isinstance(data, dict):
            raise OrderError("invalid request")
        symbol = validate_symbol(data.get("symbol"))
        side = data.get("side")
        if side not in ("BUY", "SELL"):
            raise OrderError("side must be BUY or SELL")
        qty = data.get("quantity")
        if type(qty) is not int or not 1 <= qty <= 100000:
            raise OrderError("quantity must be between 1 and 100000")
        scheduled = parse_time(data.get("scheduled_at"))
        if scheduled < now or scheduled > now + dt.timedelta(days=30):
            raise OrderError("schedule must be in the next 30 days")
        if not valid_session(scheduled):
            raise OrderError("schedule must be during NSE equity session, Mon-Fri IST")
        key = data.get("idempotency_key")
        if not isinstance(key, str) or not re.fullmatch("[A-Za-z0-9_-]{12,80}", key):
            raise OrderError("idempotency_key required (12-80 safe characters)")
        with self._db() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT * FROM orders WHERE client_key=?", (key,)).fetchone()
            if old:
                if (old["symbol"], old["side"], old["qty"], old["due_at"]) != (
                    symbol,
                    side,
                    qty,
                    to_iso(scheduled),
                ):
                    raise OrderError("idempotency_key already used with different order")
                return dict(old)
            oid = str(uuid.uuid4())
            db.execute(
                """INSERT INTO orders(id,client_key,kind,symbol,side,qty,due_at,created_at)
                          VALUES(?,?,'MANUAL',?,?,?,?,?)""",
                (oid, key, symbol, side, qty, to_iso(scheduled), to_iso(now)),
            )
            self._event(db, now, "SCHEDULED", f"{side} {qty} {symbol} at {to_iso(scheduled)}")
            return dict(db.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone())

    def cancel(self, order_id: str, now: dt.datetime | None = None) -> dict[str, Any]:
        now = now or utc_now()
        with self._db() as db:
            db.execute("BEGIN IMMEDIATE")
            result = db.execute(
                "UPDATE orders SET status='CANCELLED',completed_at=? WHERE id=? "
                "AND status='QUEUED' AND kind='MANUAL'",
                (to_iso(now), order_id),
            )
            if result.rowcount == 0:
                raise OrderError("order not found or no longer cancellable")
            self._event(db, now, "CANCELLED", order_id)
        return {"id": order_id, "status": "CANCELLED"}

    def ingest(self, payload: dict[str, Any], now: dt.datetime | None = None) -> dict[str, Any]:
        """Only a PRIVATE trusted quote collector may submit these observations."""
        now = now or utc_now()
        if not isinstance(payload, dict) or not isinstance(payload.get("quotes"), list):
            raise OrderError("quotes array required")
        if not 1 <= len(payload["quotes"]) <= 4000:
            raise OrderError("quotes batch must be 1..4000")
        normalized = []
        for q in payload["quotes"]:
            if not isinstance(q, dict):
                raise OrderError("invalid observation")
            symbol = validate_symbol(q.get("symbol"))
            paise = q.get("price_paise")
            volume = q.get("cumulative_volume")
            source = q.get("source")
            opened = q.get("exchange_open")
            observed = parse_time(q.get("observed_at"))
            if (
                type(paise) is not int
                or paise <= 0
                or paise > 100_000_000_00
                or type(volume) is not int
                or volume < 0
                or volume > 10**15
                or not isinstance(source, str)
                or not 3 <= len(source) <= 100
                or opened is not True
                or not valid_session(observed)
                or observed > now + dt.timedelta(seconds=2)
                or now - observed > dt.timedelta(seconds=STALE_SECONDS)
            ):
                raise OrderError("invalid/stale or closed-market quote; no fills")
            normalized.append((symbol, paise, volume, to_iso(observed), source, 1))
        if len({q[0] for q in normalized}) != len(normalized):
            raise OrderError("duplicate symbols in batch")
        # Only the authenticated private collector can attest complete eligible NSE
        # coverage. An incomplete quote subset is never eligible for volume ranking.
        coverage = payload.get("coverage")
        if coverage is not None:
            if (
                not isinstance(coverage, dict)
                or coverage.get("complete") is not True
                or type(coverage.get("eligible_count")) is not int
                or coverage["eligible_count"] != len(normalized)
                or len(normalized) < 500
                or len({x[4] for x in normalized}) != 1
                or len({x[3] for x in normalized}) != 1
                or type(coverage.get("nifty_change_bps")) is not int
                or not -10000 <= coverage["nifty_change_bps"] <= 10000
            ):
                raise OrderError("complete, single-snapshot NSE universe attestation required")
        with self._db() as db:
            db.execute("BEGIN IMMEDIATE")
            if coverage is not None:
                snapshot_observed = normalized[0][3]
                day = parse_time(snapshot_observed).astimezone(IST).date().isoformat()
                db.execute(
                    """INSERT INTO coverage(session,count,observed_at,source,nifty_change_bps)
                     VALUES(?,?,?,?,?)
                     ON CONFLICT(session) DO UPDATE SET count=excluded.count,
                     observed_at=excluded.observed_at,source=excluded.source,nifty_change_bps=excluded.nifty_change_bps
                     WHERE excluded.observed_at>coverage.observed_at""",
                    (
                        day,
                        len(normalized),
                        snapshot_observed,
                        normalized[0][4],
                        coverage["nifty_change_bps"],
                    ),
                )
            for row in normalized:
                db.execute(
                    """INSERT INTO quotes(symbol,price_paise,cumulative_volume,observed_at,
                     source,exchange_open)
                     VALUES(?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET
                     price_paise=excluded.price_paise,cumulative_volume=excluded.cumulative_volume,
                     observed_at=excluded.observed_at,source=excluded.source,exchange_open=excluded.exchange_open
                     WHERE excluded.observed_at>quotes.observed_at""",
                    row,
                )
        return {"accepted": len(normalized), "realOrdersEnabled": False}

    def _valid_quote(
        self, db: sqlite3.Connection, symbol: str, now: dt.datetime
    ) -> sqlite3.Row | None:
        q = db.execute("SELECT * FROM quotes WHERE symbol=?", (symbol,)).fetchone()
        if q is None or not q["exchange_open"]:
            return None
        age = (now - parse_time(q["observed_at"])).total_seconds()
        return q if -2 <= age <= STALE_SECONDS and valid_session(now) else None

    def _fill(self, db: sqlite3.Connection, order: sqlite3.Row, now: dt.datetime) -> None:
        q = self._valid_quote(db, order["symbol"], now)
        if q is None:
            self._reject(db, order, now, "MISSING_OR_STALE_MARKET_QUOTE")
            return
        held_row = db.execute(
            "SELECT qty FROM positions WHERE symbol=?", (order["symbol"],)
        ).fetchone()
        if order["kind"] == "ENTRY" and held_row and held_row["qty"] != 0:
            self._reject(db, order, now, "EXISTING_POSITION_CONFLICT")
            return
        source_paise = q["price_paise"]
        slip = (source_paise * SLIPPAGE_BPS + 9999) // 10000
        execution_paise = (
            source_paise + slip if order["side"] == "BUY" else max(1, source_paise - slip)
        )
        notional = order["qty"] * execution_paise
        fee = (notional * FEE_BPS + 9999) // 10000  # exact integer paise
        cash = int(db.execute("SELECT value FROM settings WHERE key='cash_paise'").fetchone()[0])
        current = db.execute(
            "SELECT qty,entry_paise,intraday FROM positions WHERE symbol=?", (order["symbol"],)
        ).fetchone()
        held = int(current["qty"]) if current else 0
        strategy_entry = order["kind"] == "ENTRY"
        if order["side"] == "BUY":
            cost = notional + fee
            if cost > cash:
                self._reject(db, order, now, "INSUFFICIENT_VIRTUAL_CASH")
                return
            newcash = cash - cost
            newqty = held + order["qty"]
        else:
            if held < order["qty"] and not (strategy_entry and held <= 0):
                self._reject(db, order, now, "INSUFFICIENT_VIRTUAL_HOLDINGS")
                return
            if strategy_entry:
                old_short_exposure = 0
                for p in db.execute("SELECT symbol,qty FROM positions WHERE qty<0"):
                    other = self._valid_quote(db, p["symbol"], now)
                    if other is None:
                        self._reject(db, order, now, "STALE_SHORT_EXPOSURE")
                        return
                    old_short_exposure += abs(p["qty"]) * other["price_paise"]
                if old_short_exposure + notional > INIT_CAPITAL:
                    self._reject(db, order, now, "SHORT_EXPOSURE_LIMIT")
                    return
            newcash = cash + notional - fee
            newqty = held - order["qty"]
        intraday = 1 if strategy_entry or (current and current["intraday"]) else 0
        if newqty == 0:
            entry = None
            intraday = 0
        elif strategy_entry or held == 0 or (held > 0) != (newqty > 0):
            entry = execution_paise
        elif abs(newqty) > abs(held):
            entry = (
                (current["entry_paise"] or execution_paise) * abs(held)
                + execution_paise * (abs(newqty) - abs(held))
            ) // abs(newqty)
        else:
            entry = current["entry_paise"] if current else execution_paise
        db.execute("UPDATE settings SET value=? WHERE key='cash_paise'", (str(newcash),))
        db.execute(
            """INSERT INTO positions(symbol,qty,entry_paise,intraday) VALUES(?,?,?,?)
                  ON CONFLICT(symbol) DO UPDATE SET qty=excluded.qty,
                  entry_paise=excluded.entry_paise,intraday=excluded.intraday""",
            (order["symbol"], newqty, entry, int(bool(intraday))),
        )
        db.execute(
            """UPDATE orders SET status='FILLED',fill_paise=?,fee_paise=?,
               completed_at=? WHERE id=?""",
            (execution_paise, fee, to_iso(now), order["id"]),
        )
        self._event(
            db,
            now,
            "PAPER_FILL",
            f"{order['side']} {order['qty']} {order['symbol']} source={q['source']}",
        )

    def _reject(
        self, db: sqlite3.Connection, order: sqlite3.Row, now: dt.datetime, reason: str
    ) -> None:
        db.execute(
            "UPDATE orders SET status='SKIPPED',completed_at=?,reason=? WHERE id=?",
            (to_iso(now), reason, order["id"]),
        )
        self._event(db, now, "SKIPPED", f"{order['id']} {reason}")

    def _place_strategy_order(
        self,
        db: sqlite3.Connection,
        now: dt.datetime,
        date: str,
        phase: str,
        symbol: str,
        side: str,
        qty: int,
    ) -> None:
        key = f"{date}-{phase}-{symbol}"
        db.execute(
            """INSERT OR IGNORE INTO orders(id,client_key,kind,symbol,side,qty,due_at,created_at)
                      VALUES(?,?,?,?,?,?,?,?)""",
            (str(uuid.uuid4()), key, phase, symbol, side, qty, to_iso(now), to_iso(now)),
        )
        order = db.execute("SELECT * FROM orders WHERE client_key=?", (key,)).fetchone()
        if (
            order["status"] == "SKIPPED"
            and phase == "EXIT"
            and order["reason"] == "MISSING_OR_STALE_MARKET_QUOTE"
        ):
            db.execute(
                "UPDATE orders SET status='QUEUED',reason=NULL,completed_at=NULL WHERE id=?",
                (order["id"],),
            )
            order = db.execute("SELECT * FROM orders WHERE id=?", (order["id"],)).fetchone()
        if order["status"] == "QUEUED":
            self._fill(db, order, now)

    def _strategy_phase(self, db: sqlite3.Connection, now: dt.datetime) -> None:
        local = now.astimezone(IST)
        if not valid_session(now):
            return
        date = local.date().isoformat()
        minute = local.hour * 60 + local.minute
        if minute not in (9 * 60 + 40, 15 * 60 + 15):
            return
        phase = "ENTRY" if minute == 580 else "EXIT"
        if db.execute("SELECT 1 FROM runs WHERE session=? AND phase=?", (date, phase)).fetchone():
            return
        if phase == "ENTRY":
            prior = db.execute(
                "SELECT 1 FROM positions WHERE qty!=0 AND intraday=1 LIMIT 1"
            ).fetchone()
            if prior:
                db.execute(
                    "INSERT INTO runs(session,phase,status,reason,completed_at) VALUES(?,?,?,?,?)",
                    (date, phase, "BLOCKED", "UNRESOLVED_PREVIOUS_INTRADAY", to_iso(now)),
                )
                self._event(db, now, "BLOCKED", "Unresolved intraday holdings block new entries")
                return
            coverage = db.execute("SELECT * FROM coverage WHERE session=?", (date,)).fetchone()
            if (
                coverage is None
                or not -2
                <= (now - parse_time(coverage["observed_at"])).total_seconds()
                <= STALE_SECONDS
            ):
                return  # no point-in-time full-universe attestation
            candidates = db.execute(
                "SELECT * FROM quotes ORDER BY cumulative_volume DESC,symbol ASC"
            ).fetchall()
            candidates = [q for q in candidates if self._valid_quote(db, q["symbol"], now)]
            if len(candidates) != coverage["count"] or len(candidates) < 10:
                return  # full fresh source universe required, not a convenient top-10 sample
            score = coverage["nifty_change_bps"]
            if -20 < score < 20:
                db.execute(
                    "INSERT INTO runs(session,phase,status,reason,completed_at) VALUES(?,?,?,?,?)",
                    (date, phase, "NO_TRADE", "NEUTRAL_NIFTY", to_iso(now)),
                )
                self._event(db, now, "NO_TRADE", f"{date} neutral Nifty signal; no entries")
                return
            side = "BUY" if score >= 20 else "SELL"
            cash = int(
                db.execute("SELECT value FROM settings WHERE key='cash_paise'").fetchone()[0]
            )
            allocation = min(cash, INIT_CAPITAL) // 10
            for q in candidates[:10]:
                qty = (allocation * 995 // 1000) // q["price_paise"]
                if qty:
                    self._place_strategy_order(db, now, date, phase, q["symbol"], side, qty)
        else:
            holdings = db.execute(
                "SELECT symbol,qty FROM positions WHERE qty!=0 AND intraday=1 ORDER BY symbol"
            ).fetchall()
            for p in holdings:
                self._place_strategy_order(
                    db,
                    now,
                    date,
                    phase,
                    p["symbol"],
                    "SELL" if p["qty"] > 0 else "BUY",
                    abs(p["qty"]),
                )
            if db.execute("SELECT 1 FROM positions WHERE qty!=0 AND intraday=1 LIMIT 1").fetchone():
                return  # retry outstanding exits within 15:15 window only
        db.execute(
            "INSERT INTO runs(session,phase,status,completed_at) VALUES(?,?,?,?)",
            (date, phase, "EXECUTED", to_iso(now)),
        )
        self._event(db, now, "STRATEGY_PHASE", f"{date} {phase} processed")

    def _strategy_stops(self, db: sqlite3.Connection, now: dt.datetime) -> None:
        if not valid_session(now):
            return
        day = now.astimezone(IST).date().isoformat()
        for p in db.execute(
            "SELECT symbol,qty,entry_paise FROM positions WHERE qty!=0 AND intraday=1"
        ).fetchall():
            q = self._valid_quote(db, p["symbol"], now)
            if q is None or p["entry_paise"] is None:
                continue
            entry = p["entry_paise"]
            adverse = (p["qty"] > 0 and q["price_paise"] * 100 <= entry * 98) or (
                p["qty"] < 0 and q["price_paise"] * 100 >= entry * 102
            )
            if adverse:
                self._place_strategy_order(
                    db,
                    now,
                    day,
                    "STOP",
                    p["symbol"],
                    "SELL" if p["qty"] > 0 else "BUY",
                    abs(p["qty"]),
                )

    def _record_missed_phases(self, db: sqlite3.Connection, now: dt.datetime) -> None:
        local = now.astimezone(IST)
        if local.weekday() >= 5:
            return
        day = local.date().isoformat()
        minute = local.hour * 60 + local.minute
        for phase, due in (("ENTRY", 580), ("EXIT", 915)):
            if minute <= due:
                continue
            if db.execute(
                "SELECT 1 FROM runs WHERE session=? AND phase=?", (day, phase)
            ).fetchone():
                continue
            if (
                phase == "ENTRY"
                and db.execute(
                    "SELECT value FROM settings WHERE key='strategy_enabled'"
                ).fetchone()[0]
                != "1"
            ):
                continue
            outstanding = db.execute(
                "SELECT 1 FROM positions WHERE qty!=0 AND intraday=1 LIMIT 1"
            ).fetchone()
            if phase == "EXIT" and not outstanding:
                continue
            reason = (
                "UNVERIFIED_ENTRY_DATA_OR_MISSED_WINDOW"
                if phase == "ENTRY"
                else "EXIT_INCOMPLETE_POSITIONS_REMAIN"
            )
            db.execute(
                "INSERT INTO runs(session,phase,status,reason,completed_at) VALUES(?,?,?,?,?)",
                (day, phase, "SKIPPED" if phase == "ENTRY" else "PARTIAL", reason, to_iso(now)),
            )
            self._event(db, now, "MISSED_PHASE", f"{day} {phase}: {reason}")

    def tick(self, now: dt.datetime | None = None) -> dict[str, Any]:
        now = now or utc_now()
        if now.tzinfo is None:
            raise OrderError("UTC clock must be aware")
        with self._db() as db:
            db.execute("BEGIN IMMEDIATE")
            queued = db.execute(
                "SELECT * FROM orders WHERE status='QUEUED' AND due_at<=? "
                "ORDER BY due_at,id LIMIT 500",
                (to_iso(now),),
            ).fetchall()
            for order in queued:
                if (now - parse_time(order["due_at"])).total_seconds() > MAX_DELAY_SECONDS:
                    self._reject(db, order, now, "SCHEDULER_LATE_NO_BACKFILL")
                elif not valid_session(now):
                    self._reject(db, order, now, "MARKET_CLOSED")
                else:
                    self._fill(db, order, now)
            enabled = (
                db.execute("SELECT value FROM settings WHERE key='strategy_enabled'").fetchone()[0]
                == "1"
            )
            self._strategy_stops(db, now)  # stops still apply after disarming new entries
            has_intraday = db.execute(
                "SELECT 1 FROM positions WHERE qty!=0 AND intraday=1 LIMIT 1"
            ).fetchone()
            local = now.astimezone(IST)
            if enabled or (has_intraday and local.hour == 15 and local.minute == 15):
                self._strategy_phase(db, now)
            self._record_missed_phases(db, now)
        return {"processed": len(queued), "strategy_enabled": enabled, "realOrdersEnabled": False}

    def overview(self, now: dt.datetime | None = None) -> dict[str, Any]:
        now = now or utc_now()
        with self._db() as db:
            orders = [
                dict(x)
                for x in db.execute(
                    "SELECT * FROM orders ORDER BY created_at DESC,id DESC LIMIT 100"
                )
            ]
            holdings = [
                dict(x)
                for x in db.execute("SELECT symbol,qty FROM positions WHERE qty!=0 ORDER BY symbol")
            ]
            cash = int(
                db.execute("SELECT value FROM settings WHERE key='cash_paise'").fetchone()[0]
            )
            strategy = (
                db.execute("SELECT value FROM settings WHERE key='strategy_enabled'").fetchone()[0]
                == "1"
            )
            events = [dict(x) for x in db.execute("SELECT * FROM events ORDER BY id DESC LIMIT 40")]
            latest = db.execute(
                "SELECT completed_at,status,reason FROM runs ORDER BY completed_at DESC LIMIT 1"
            ).fetchone()
            equity = cash
            markable = True
            for p in holdings:
                q = self._valid_quote(db, p["symbol"], now)
                if q is None:
                    markable = False
                else:
                    equity += p["qty"] * q["price_paise"]
            return {
                "mode": "PAPER_ONLY",
                "realOrdersEnabled": False,
                "cash_paise": cash,
                "equity_paise": equity if markable else None,
                "positions": holdings,
                "orders": orders,
                "events": events,
                "strategy_enabled": strategy,
                "strategy": "NSE_TOP_VOLUME_0940_EXIT_1515",
                "last_strategy_phase": dict(latest) if latest else None,
                "quotes_fresh": markable and bool(holdings),
                "server_time": to_iso(now),
                "market_session": valid_session(now),
            }
