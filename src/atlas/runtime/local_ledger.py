"""Read-only reconciliation of the owner's recorded Mac paper ledger."""

from __future__ import annotations

import json
import re
import sqlite3
import time
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


def _money(value: Decimal) -> int:
    return int((value * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _decimal(raw: object) -> Decimal:
    value = Decimal(str(raw))
    if not value.is_finite():
        raise ValueError("Nonfinite ledger value")
    return value


def _stamp(value: int) -> str:
    return datetime.fromtimestamp(value, UTC).isoformat()


def report(path: Path, now: int | None = None) -> dict[str, Any]:
    """Read one consistent snapshot; never mutate source state or replay signals."""
    now = int(time.time()) if now is None else now
    path = path.expanduser().absolute()
    if type(now) is not int or now < 0 or not path.is_file() or path.is_symlink():
        raise ValueError("Existing regular ledger and valid clock required")
    db = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=3)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA query_only=ON")
    db.execute("BEGIN")
    try:
        runtime = dict(db.execute("SELECT * FROM runtime WHERE singleton=1").fetchone())
        accounts = []
        for s in db.execute("SELECT * FROM strategies ORDER BY id"):
            if s["symbol"] not in {"BTCINR", "ETHINR"} or not re.fullmatch(
                r"[a-z0-9-]{1,48}", s["id"]
            ):
                raise ValueError("Unrecognized paper account")
            initial = s["initial_paise"]
            if type(initial) is not int or initial <= 0 or s["created_at"] > now + 5:
                raise ValueError("Invalid paper account")
            fills = list(
                db.execute("SELECT * FROM fills WHERE strategy_id=? ORDER BY source_ts", (s["id"],))
            )
            quotes = list(
                db.execute(
                    "SELECT * FROM quotes WHERE symbol=? AND source_ts>=? ORDER BY source_ts",
                    (s["symbol"], s["created_at"]),
                )
            )
            quote_map = {q["source_ts"]: q for q in quotes}
            cash, units, basis, realized, fees = initial, Decimal(0), 0, 0, 0
            trades: list[dict[str, Any]] = []
            daily: dict[str, dict[str, Any]] = {}
            states: list[tuple[int, int, Decimal]] = []
            for f in fills:
                ts = f["source_ts"]
                if type(ts) is not int or ts < s["created_at"] or ts > now + 5:
                    raise ValueError("Invalid fill clock")
                q = quote_map.get(ts)
                if q is None or f["provider"] != "CoinDCX public ticker":
                    raise ValueError("Fill lacks recorded quote")
                qty, price, fee = _decimal(f["quantity"]), _decimal(f["price"]), f["fee_paise"]
                if qty <= 0 or price <= 0 or type(fee) is not int or fee < 0:
                    raise ValueError("Invalid fill values")
                if q["received_at"] > now + 5 or abs(q["received_at"] - ts) > 90:
                    raise ValueError("Fill lacks timely receipt")
                if f["side"] not in ("BUY", "SELL") or price != _decimal(
                    q["ask"] if f["side"] == "BUY" else q["bid"]
                ):
                    raise ValueError("Fill price diverges from observed side")
                amount, net = _money(qty * price), None
                if f["side"] == "BUY":
                    if units != 0 or amount + fee > cash:
                        raise ValueError("Invalid buy accounting")
                    cash, units, basis = cash - amount - fee, qty, amount + fee
                else:
                    if units != qty:
                        raise ValueError("Invalid sell accounting")
                    net = amount - fee - basis
                    realized += net
                    cash, units, basis = cash + amount - fee, Decimal(0), 0
                if cash != f["cash_after_paise"] or units != _decimal(f["units_after"]):
                    raise ValueError("Recorded accounting diverges")
                states.append((ts, cash, units))
                fees += fee
                date = datetime.fromtimestamp(ts, ZoneInfo("Asia/Kolkata")).date().isoformat()
                d = daily.setdefault(
                    date, {"date": date, "buys": 0, "sells": 0, "feePaise": 0, "realizedPaise": 0}
                )
                d["buys" if f["side"] == "BUY" else "sells"] += 1
                d["feePaise"] += fee
                d["realizedPaise"] += net or 0
                trades.append(
                    {
                        "sourceAt": _stamp(ts),
                        "side": f["side"],
                        "quantity": str(qty),
                        "priceINR": str(price),
                        "feeINR": fee / 100,
                        "realizedPnlINR": None if net is None else net / 100,
                    }
                )
            if cash != s["cash_paise"] or units != _decimal(s["units"]):
                raise ValueError("Account balance diverges from fills")
            latest = quotes[-1] if quotes else None
            age = now - latest["source_ts"] if latest else None
            fresh = age is not None and -5 <= age <= 90
            mark = _decimal(latest["bid"]) if fresh and latest is not None else None
            if mark is not None and mark <= 0:
                raise ValueError("Invalid mark")
            equity = (
                cash + _money(units * mark) if mark is not None else cash if units == 0 else None
            )
            unrealized = equity - cash - basis if equity is not None else None
            total = equity - initial if equity is not None else None
            if total is not None and total != realized + (unrealized or 0):
                raise ValueError("Realized/unrealized reconciliation failed")
            peak, max_drawdown, cursor = initial, Decimal(0), 0
            curve_cash, curve_units, previous_observed_close = initial, Decimal(0), initial
            closes = {}
            for q in quotes:
                if type(q["received_at"]) is not int or q["received_at"] > now + 5:
                    raise ValueError("Invalid observation receipt")
                while cursor < len(states) and states[cursor][0] <= q["source_ts"]:
                    _, curve_cash, curve_units = states[cursor]
                    cursor += 1
                price = _decimal(q["bid"])
                if price <= 0:
                    raise ValueError("Invalid recorded mark")
                value = curve_cash + _money(curve_units * price)
                peak = max(peak, value)
                max_drawdown = max(max_drawdown, Decimal(peak - value) / Decimal(peak))
                date = (
                    datetime.fromtimestamp(q["source_ts"], ZoneInfo("Asia/Kolkata"))
                    .date()
                    .isoformat()
                )
                closes[date] = (value, q["source_ts"])
            for date, (value, observed_at) in sorted(closes.items()):
                d = daily.setdefault(
                    date, {"date": date, "buys": 0, "sells": 0, "feePaise": 0, "realizedPaise": 0}
                )
                d["closingEquityINR"] = value / 100
                d["lastObservationAt"] = _stamp(observed_at)
                d["observedEquityChangeINR"] = (value - previous_observed_close) / 100
                previous_observed_close = value
            risk_table = db.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='owner_paper_risk_halts'"
            ).fetchone()
            risk_halted = bool(
                risk_table
                and db.execute(
                    "SELECT 1 FROM owner_paper_risk_halts WHERE strategy_id=?", (s["id"],)
                ).fetchone()
            )
            days = [
                {
                    "date": d["date"],
                    "buys": d["buys"],
                    "sells": d["sells"],
                    "feesINR": d["feePaise"] / 100,
                    "realizedPnlINR": d["realizedPaise"] / 100,
                    "closingEquityINR": d.get("closingEquityINR"),
                    "lastObservationAt": d.get("lastObservationAt"),
                    "observedEquityChangeINR": d.get("observedEquityChangeINR"),
                }
                for d in sorted(daily.values(), key=lambda d: d["date"])
            ]
            month_groups: dict[str, dict[str, Any]] = {}
            for day_values in daily.values():
                month = day_values["date"][:7]
                group = month_groups.setdefault(
                    month,
                    {
                        "month": month,
                        "recordedDays": 0,
                        "buys": 0,
                        "sells": 0,
                        "feePaise": 0,
                        "realizedPaise": 0,
                    },
                )
                for key in ["buys", "sells", "feePaise", "realizedPaise"]:
                    group[key] += day_values[key]
                group["recordedDays"] += 1
            monthly = [
                {
                    "month": g["month"],
                    "recordedDays": g["recordedDays"],
                    "buys": g["buys"],
                    "sells": g["sells"],
                    "feesINR": g["feePaise"] / 100,
                    "realizedPnlINR": g["realizedPaise"] / 100,
                    "completeMonthCoverageVerified": False,
                }
                for g in sorted(month_groups.values(), key=lambda g: g["month"])
            ]
            accounts.append(
                {
                    "id": s["id"],
                    "symbol": s["symbol"],
                    "kind": s["kind"],
                    "active": bool(s["active"]),
                    "createdAt": _stamp(s["created_at"]),
                    "virtualCapitalINR": initial / 100,
                    "cashINR": cash / 100,
                    "units": str(units),
                    "equityINR": None if equity is None else equity / 100,
                    "realizedPnlINR": realized / 100,
                    "unrealizedPnlINR": None if unrealized is None else unrealized / 100,
                    "netPnlINR": None if total is None else total / 100,
                    "feesINR": fees / 100,
                    "paperFills": len(fills),
                    "quoteCount": len(quotes),
                    "lastSourceAt": _stamp(latest["source_ts"]) if latest else None,
                    "quoteAgeSeconds": age,
                    "markFresh": fresh,
                    "daily": days,
                    "monthly": monthly,
                    "recentTrades": trades[-30:][::-1],
                    "accountingVerified": True,
                    "riskHalted": risk_halted,
                    "maxObservedPeakINR": peak / 100,
                    "maxObservedDrawdownPct": float(max_drawdown * 100),
                    "drawdownScope": "recorded quote marks only; not full exchange ticks",
                }
            )
        return {
            "schema": "atlas.mac-forward-paper.v1",
            "asOf": _stamp(now),
            "mode": "OWNER_LOCAL_RECORDED_PAPER",
            "realOrdersEnabled": False,
            "actualCapitalINR": 0,
            "independentStrategyAccounts": True,
            "source": "Owner Mac recorded quote/fill ledger",
            "runtime": {
                "status": runtime["status"],
                "lastCheckedAt": _stamp(runtime["checked_at"]) if runtime["checked_at"] else None,
            },
            "accounts": accounts,
            "historicalNseSessionsCertified": 0,
            "limitations": [
                "Paper fills are modeled, not broker executions.",
                "Fees are research assumptions; full venue charges and impact are not certified.",
                "Independent comparison accounts must not be added.",
                "Local receipts are not exchange certification.",
            ],
        }
    finally:
        db.close()


def write_report(path: Path, output: Path) -> None:
    import os

    payload = (json.dumps(report(path), indent=2) + "\n").encode()
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(payload)


def trade_day(path: Path, strategy_id: str, date_value: str, offset: int = 0) -> dict[str, Any]:
    """Page recorded fills for one IST day after full independent account reconciliation."""
    from datetime import date, timedelta

    if not re.fullmatch(r"[a-z0-9-]{1,48}", strategy_id):
        raise ValueError("Invalid strategy identity")
    selected = date.fromisoformat(date_value)
    if (
        selected.isoformat() != date_value
        or type(offset) is not int
        or not 0 <= offset <= 1_000_000
    ):
        raise ValueError("Invalid day or page")
    verified = report(path)
    account = next((a for a in verified["accounts"] if a["id"] == strategy_id), None)
    if account is None:
        raise ValueError("Unknown strategy")
    start = int(
        datetime.combine(selected, datetime.min.time(), ZoneInfo("Asia/Kolkata")).timestamp()
    )
    end = int(
        datetime.combine(
            selected + timedelta(days=1), datetime.min.time(), ZoneInfo("Asia/Kolkata")
        ).timestamp()
    )
    db = sqlite3.connect(path.expanduser().absolute().as_uri() + "?mode=ro", uri=True, timeout=3)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA query_only=ON")
    db.execute("BEGIN")
    try:
        count = db.execute(
            "SELECT COUNT(*) FROM fills WHERE strategy_id=?", (strategy_id,)
        ).fetchone()[0]
        if count != account["paperFills"]:
            raise ValueError("Ledger changed during report; retry")
        total = db.execute(
            "SELECT COUNT(*) FROM fills WHERE strategy_id=? AND source_ts>=? AND source_ts<?",
            (strategy_id, start, end),
        ).fetchone()[0]
        rows = db.execute(
            "SELECT * FROM fills WHERE strategy_id=? AND source_ts>=? AND source_ts<? "
            "ORDER BY source_ts LIMIT 100 OFFSET ?",
            (strategy_id, start, end, offset),
        ).fetchall()
        return {
            "schema": "atlas.mac-forward-paper-day.v1",
            "strategyId": strategy_id,
            "date": date_value,
            "asOf": verified["asOf"],
            "totalEvents": total,
            "offset": offset,
            "nextOffset": offset + len(rows) if offset + len(rows) < total else None,
            "accountingVerified": True,
            "realOrdersEnabled": False,
            "events": [
                {
                    "sourceAt": _stamp(r["source_ts"]),
                    "side": r["side"],
                    "quantity": r["quantity"],
                    "priceINR": r["price"],
                    "feeINR": r["fee_paise"] / 100,
                }
                for r in rows
            ],
        }
    finally:
        db.close()
