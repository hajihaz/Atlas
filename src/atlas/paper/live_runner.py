"""Atlas INR forward-paper runner. No broker imports and no live order capability.

CoinDCX public BTCINR/ETHINR snapshots (timestamps, bid, ask) are observations,
not an exchange-guaranteed tick feed. Orders are paper fills on the *next*
independently observed quote, never retroactive at the signal quote.
Strategies are isolated comparison accounts; their capitals are NOT additive.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path
from typing import Any

PROVIDER = "CoinDCX public ticker"
SYMBOLS = ("BTCINR", "ETHINR")
DB_DEFAULT = Path.home() / ".atlas" / "live-paper.sqlite3"
MAX_AGE = 90
POLL_SECONDS = 20
FEE_BPS = Decimal("10")  # explicit research assumption, NOT broker-confirmed
MONEY = Decimal("0.01")
UNIT = Decimal("0.00000001")


def money(n: Decimal) -> int:
    return int((n * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def inr(paise: int) -> Decimal:
    return Decimal(paise) / 100


def positive(raw: object) -> Decimal:
    try:
        result = Decimal(str(raw))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("non-numeric price") from exc
    if not result.is_finite() or result <= 0:
        raise ValueError("invalid nonpositive price")
    return result


@contextmanager
def transaction(db: sqlite3.Connection) -> Iterator[None]:
    db.execute("BEGIN IMMEDIATE")
    try:
        yield
        db.commit()
    except BaseException:
        db.rollback()
        raise


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.parent.chmod(0o700)
    conn = sqlite3.connect(path, timeout=10, isolation_level=None)
    path.chmod(0o600)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS strategies (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL CHECK(symbol IN ('BTCINR','ETHINR')),
      kind TEXT NOT NULL CHECK(kind IN ('sma','momentum')),
      fast INTEGER NOT NULL CHECK(fast >= 2),
      slow INTEGER NOT NULL CHECK(slow > fast AND slow <= 300),
      initial_paise INTEGER NOT NULL CHECK(initial_paise > 0),
      cash_paise INTEGER NOT NULL CHECK(cash_paise >= 0),
      units TEXT NOT NULL DEFAULT '0',
      allocation_bps INTEGER NOT NULL CHECK(allocation_bps > 0 AND allocation_bps <= 10000),
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      seen_ts INTEGER NOT NULL DEFAULT 0,
      pending TEXT NOT NULL DEFAULT '' CHECK(pending IN ('','BUY','SELL')),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quotes (
      symbol TEXT NOT NULL,
      source_ts INTEGER NOT NULL,
      bid TEXT NOT NULL,
      ask TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      PRIMARY KEY(symbol,source_ts)
    );
    CREATE TABLE IF NOT EXISTS fills (
      strategy_id TEXT NOT NULL REFERENCES strategies(id),
      source_ts INTEGER NOT NULL,
      side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
      quantity TEXT NOT NULL,
      price TEXT NOT NULL,
      fee_paise INTEGER NOT NULL CHECK(fee_paise>=0),
      cash_after_paise INTEGER NOT NULL,
      units_after TEXT NOT NULL,
      provider TEXT NOT NULL,
      PRIMARY KEY(strategy_id,source_ts)
    );
    CREATE TABLE IF NOT EXISTS runtime (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      checked_at INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'NOT_STARTED',
      reason TEXT NOT NULL DEFAULT ''
    );
    INSERT OR IGNORE INTO runtime(singleton) VALUES (1);
    """)
    return conn


def decode_tickers(data: object, now: int) -> list[dict[str, Any]]:
    if not isinstance(data, list):
        raise ValueError("provider response not a list")
    found: dict[str, dict[str, Any]] = {}
    for row in data:
        if not isinstance(row, dict) or row.get("market") not in SYMBOLS:
            continue
        symbol = row["market"]
        if symbol in found:
            raise ValueError("duplicate market in feed")
        timestamp = row.get("timestamp")
        if type(timestamp) is not int or timestamp > now + 5 or timestamp < now - MAX_AGE:
            raise ValueError(f"{symbol}: stale/future/missing trade timestamp")
        bid, ask = positive(row.get("bid")), positive(row.get("ask"))
        last = positive(row.get("last_price"))
        if bid > ask or ask / bid > Decimal("1.05"):
            raise ValueError(f"{symbol}: crossed/excessive spread")
        if last > ask * Decimal("1.05") or last < bid * Decimal("0.95"):
            raise ValueError(f"{symbol}: last price outside valid band")
        found[symbol] = {"symbol": symbol, "timestamp": timestamp, "bid": str(bid), "ask": str(ask)}
    if len(found) != len(SYMBOLS):
        raise ValueError("required INR markets missing")
    return [found[s] for s in SYMBOLS]


def add_strategy(
    db: sqlite3.Connection,
    *,
    id: str,
    symbol: str,
    kind: str,
    fast: int,
    slow: int,
    capital: int = 100000,
    allocation_bps: int = 1000,
    now: int | None = None,
) -> None:
    if (
        not id
        or len(id) > 48
        or not all(c.islower() or c.isdigit() or c == "-" for c in id)
        or symbol not in SYMBOLS
        or kind not in ("sma", "momentum")
        or not (2 <= fast < slow <= 300)
        or not (1000 <= capital <= 10_000_000)
        or not (1 <= allocation_bps <= 10000)
    ):
        raise ValueError(
            "strategy settings rejected: use lowercase ID, INR market and safe parameters"
        )
    now = int(time.time()) if now is None else now
    with transaction(db):
        db.execute(
            """INSERT INTO strategies
        (id,symbol,kind,fast,slow,initial_paise,cash_paise,allocation_bps,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)""",
            (id, symbol, kind, fast, slow, capital * 100, capital * 100, allocation_bps, now),
        )


def _signal(db: sqlite3.Connection, row: sqlite3.Row) -> str:
    observations = db.execute(
        "SELECT bid,ask FROM quotes WHERE symbol=? AND source_ts>=? "
        "ORDER BY source_ts DESC LIMIT ?",
        (row["symbol"], row["created_at"], row["slow"]),
    ).fetchall()
    if len(observations) < row["slow"]:
        return ""
    close = [((Decimal(r["bid"]) + Decimal(r["ask"])) / 2) for r in observations]
    if row["kind"] == "sma":
        current = sum(close[: row["fast"]]) / row["fast"]
        long = sum(close) / row["slow"]
        return "BUY" if current > long else "SELL"
    # Momentum compares two actual observed prices; no unseen history.
    return "BUY" if close[0] > close[row["slow"] - 1] else "SELL"


def _fill(
    db: sqlite3.Connection, s: sqlite3.Row, quote: dict[str, Any], side: str
) -> tuple[int, Decimal] | None:
    cash, units = s["cash_paise"], Decimal(s["units"])
    price = Decimal(quote["ask"] if side == "BUY" else quote["bid"])
    fee_rate = FEE_BPS / 10000
    if side == "BUY":
        if units > 0:
            return None
        budget = min(inr(cash), inr(s["initial_paise"]) * s["allocation_bps"] / 10000)
        qty = (budget / (price * (1 + fee_rate))).quantize(UNIT, rounding=ROUND_DOWN)
        if qty <= 0:
            return None
        cost = money(qty * price)
        fee = money(qty * price * fee_rate)
        if cash < cost + fee:
            return None
        cash -= cost + fee
        units = qty
    else:
        if units <= 0:
            return None
        qty = units
        gross = money(qty * price)
        fee = money(qty * price * fee_rate)
        cash += gross - fee
        units = Decimal("0")
    db.execute(
        """INSERT INTO fills
       (strategy_id,source_ts,side,quantity,price,fee_paise,cash_after_paise,units_after,provider)
       VALUES (?,?,?,?,?,?,?,?,?)""",
        (s["id"], quote["timestamp"], side, str(qty), str(price), fee, cash, str(units), PROVIDER),
    )
    return cash, units


def ingest(db: sqlite3.Connection, quotes: list[dict[str, Any]], now: int) -> dict[str, Any]:
    # A single SQLite transaction means crash/retry cannot duplicate a fill.
    decoded = decode_tickers(
        [
            {
                "market": q["symbol"],
                "timestamp": q["timestamp"],
                "bid": q["bid"],
                "ask": q["ask"],
                "last_price": q.get("last_price", q["bid"]),
            }
            for q in quotes
        ],
        now,
    )
    with transaction(db):
        for q in decoded:
            db.execute(
                """INSERT OR IGNORE INTO quotes
              (symbol,source_ts,bid,ask,received_at) VALUES (?,?,?,?,?)""",
                (q["symbol"], q["timestamp"], q["bid"], q["ask"], now),
            )
            strategies = db.execute(
                "SELECT * FROM strategies WHERE symbol=? AND active=1", (q["symbol"],)
            ).fetchall()
            for strategy in strategies:
                # Quotes before a strategy was created may warm global history
                # but must never create retroactive paper executions.
                if q["timestamp"] <= strategy["seen_ts"] or q["timestamp"] < strategy["created_at"]:
                    continue
                pending = strategy["pending"]
                if strategy["seen_ts"] and q["timestamp"] - strategy["seen_ts"] > MAX_AGE:
                    pending = ""  # disconnect/stall cancels obsolete intents
                filled = _fill(db, strategy, q, pending) if pending else None
                cash = filled[0] if filled else strategy["cash_paise"]
                units = filled[1] if filled else Decimal(strategy["units"])
                decision = _signal(db, strategy)
                desired = ""
                if decision == "BUY" and units <= 0:
                    desired = "BUY"
                elif decision == "SELL" and units > 0:
                    desired = "SELL"
                db.execute(
                    """UPDATE strategies SET cash_paise=?,units=?,seen_ts=?,pending=? WHERE id=?""",
                    (cash, str(units), q["timestamp"], desired, strategy["id"]),
                )
        db.execute(
            "UPDATE runtime SET checked_at=?,status='CONNECTED',reason='' WHERE singleton=1", (now,)
        )
    return status(db, now)


def failure(db: sqlite3.Connection, reason: str, now: int | None = None) -> None:
    now = int(time.time()) if now is None else now
    with transaction(db):
        db.execute(
            "UPDATE runtime SET checked_at=?,status='DISCONNECTED',reason=? WHERE singleton=1",
            (now, reason[:180]),
        )


def status(db: sqlite3.Connection, now: int | None = None) -> dict[str, Any]:
    now = int(time.time()) if now is None else now
    live = dict(db.execute("SELECT * FROM runtime WHERE singleton=1").fetchone())
    quotes = {}
    for market in SYMBOLS:
        q = db.execute(
            "SELECT * FROM quotes WHERE symbol=? ORDER BY source_ts DESC LIMIT 1", (market,)
        ).fetchone()
        valid = q is not None and 0 <= now - q["source_ts"] <= MAX_AGE
        quotes[market] = {
            "sourceAt": datetime.fromtimestamp(q["source_ts"], UTC).isoformat() if q else None,
            "ageSeconds": now - q["source_ts"] if q else None,
            "bidINR": str(q["bid"]) if valid else None,
            "askINR": str(q["ask"]) if valid else None,
            "status": "RECENT" if valid else "STALE_OR_MISSING",
        }
    accounts = []
    for s in db.execute("SELECT * FROM strategies ORDER BY id"):
        q = quotes[s["symbol"]]
        units = Decimal(s["units"])
        equity = None
        if units == 0:
            equity = inr(s["cash_paise"])
        elif q["bidINR"] is not None:
            equity = inr(s["cash_paise"]) + units * Decimal(q["bidINR"])
        fills = db.execute("SELECT COUNT(*) FROM fills WHERE strategy_id=?", (s["id"],)).fetchone()[
            0
        ]
        accounts.append(
            {
                "id": s["id"],
                "kind": s["kind"],
                "symbol": s["symbol"],
                "active": bool(s["active"]),
                "virtualCapitalINR": str(inr(s["initial_paise"])),
                "cashINR": str(inr(s["cash_paise"])),
                "equityINR": str(equity.quantize(MONEY)) if equity is not None else None,
                "pnlINR": str((equity - inr(s["initial_paise"])).quantize(MONEY))
                if equity is not None
                else None,
                "units": s["units"],
                "paperFills": fills,
                "pending": s["pending"],
                "lastObservedAt": datetime.fromtimestamp(s["seen_ts"], UTC).isoformat()
                if s["seen_ts"]
                else None,
            }
        )
    return {
        "schema": 1,
        "mode": "FORWARD_PAPER_ONLY",
        "provider": PROVIDER,
        "feedStatus": live["status"],
        "lastCheckedAt": datetime.fromtimestamp(live["checked_at"], UTC).isoformat()
        if live["checked_at"]
        else None,
        "lastError": live["reason"],
        "realOrdersEnabled": False,
        "independentStrategyAccounts": True,
        "feeAssumptionBps": str(FEE_BPS),
        "quotes": quotes,
        "strategies": accounts,
    }


def cli() -> None:
    p = argparse.ArgumentParser(
        description="Atlas read-only INR-source forward paper engine (NO real orders)"
    )
    p.add_argument("--db", type=Path, default=DB_DEFAULT)
    sub = p.add_subparsers(dest="action", required=True)
    add = sub.add_parser("add")
    add.add_argument("id")
    add.add_argument("--symbol", choices=SYMBOLS, required=True)
    add.add_argument("--kind", choices=("sma", "momentum"), required=True)
    add.add_argument("--fast", type=int, default=5)
    add.add_argument("--slow", type=int, default=20)
    add.add_argument("--capital", type=int, default=100000)
    add.add_argument("--allocation-bps", type=int, default=1000)
    sub.add_parser("once")
    sub.add_parser("run")
    sub.add_parser("status")
    change = sub.add_parser("set-active")
    change.add_argument("id")
    change.add_argument("state", choices=("on", "off"))
    args = p.parse_args()
    db = connect(args.db)
    if args.action == "add":
        add_strategy(
            db,
            id=args.id,
            symbol=args.symbol,
            kind=args.kind,
            fast=args.fast,
            slow=args.slow,
            capital=args.capital,
            allocation_bps=args.allocation_bps,
        )
        print(json.dumps(status(db), indent=2))
    elif args.action == "set-active":
        with transaction(db):
            result = db.execute(
                "UPDATE strategies SET active=?,pending='' WHERE id=?",
                (int(args.state == "on"), args.id),
            )
            if result.rowcount != 1:
                raise ValueError("unknown strategy ID")
        print(json.dumps(status(db), indent=2))
    elif args.action == "status":
        print(json.dumps(status(db), indent=2))
    else:
        # Explicit unprivileged network adapter boundary; trading core remains local-only.
        from scripts.atlas_public_quote_source import fetch_quotes

        while True:
            now = int(time.time())
            try:
                observations = fetch_quotes()
                now = int(time.time())
                state = ingest(db, observations, now)
                print(
                    json.dumps(
                        {
                            "checkedAt": state["lastCheckedAt"],
                            "feedStatus": state["feedStatus"],
                            "paperFills": sum(s["paperFills"] for s in state["strategies"]),
                        }
                    ),
                    flush=True,
                )
            except Exception as exc:
                failure(db, type(exc).__name__ + ": " + str(exc), int(time.time()))
                print(
                    json.dumps({"status": "DISCONNECTED", "reason": str(exc)[:150]}),
                    file=sys.stderr,
                    flush=True,
                )
            if args.action == "once":
                break
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    cli()
