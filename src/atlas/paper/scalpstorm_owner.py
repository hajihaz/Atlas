"""Owner's 09:40 volume strategy. Integer accounting; no network/order authority.

The previous five comparison ledgers are deliberately never opened or migrated.
"""

from __future__ import annotations

import copy
import datetime as dt
import hashlib
import json
import math
import os
import sqlite3
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")
POLICY: dict[str, Any] = {
    "strategyId": "scalpstorm_x_0940",
    "capitalPaise": 10_000_000,
    "slotPaise": 1_000_000,
    "slots": 10,
    "entryMinute": 580,
    "exitMinute": 915,
    "niftySignalMinute": 570,
    "niftyThresholdBps": 20,
    "feeBps": 10,
    "slippageBps": 5,
    "leverage": 1,
    "entryWindowSeconds": 60,
    "maxQuoteAgeMs": 10_000,
}
SCHEMA = "atlas.scalpstorm-owner.v1"
ENGINE_FINGERPRINT = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()


def millis(value: str) -> int:
    t = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if t.tzinfo is None:
        raise ValueError("timezone required")
    return round(t.timestamp() * 1000)


def iso(value: int) -> str:
    return dt.datetime.fromtimestamp(value / 1000, dt.UTC).isoformat()


def local(value: int) -> dt.datetime:
    return dt.datetime.fromtimestamp(value / 1000, IST)


def session_time(date: str, minute: int) -> int:
    return millis(f"{date}T{minute // 60:02}:{minute % 60:02}:00+05:30")


def paise(value: Any) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or not 0 < value < 10_000_000
    ):
        raise ValueError("invalid price")
    return math.floor(value * 100 + 0.5)


def new_state(now: int, mode: str = "FORWARD") -> dict[str, Any]:
    if mode not in {"FORWARD", "HISTORICAL_REPLAY"}:
        raise ValueError("unapproved source class")
    return {
        "schema": SCHEMA,
        "policyHash": digest(POLICY),
        "engineFingerprint": ENGINE_FINGERPRINT,
        "mode": mode,
        "createdAt": now,
        "lastInputAt": 0,
        "status": "WAITING_MARKET",
        "cashPaise": POLICY["capitalPaise"],
        "feesPaise": 0,
        "realizedPaise": 0,
        "positions": {},
        "days": {},
        "fills": 0,
        "lastSourceAt": None,
        "nifty": None,
        "ranking": None,
    }


def validate_state(s: dict[str, Any]) -> None:
    if (
        s.get("schema") != SCHEMA
        or s.get("policyHash") != digest(POLICY)
        or s.get("mode") not in {"FORWARD", "HISTORICAL_REPLAY"}
        or s.get("engineFingerprint") != ENGINE_FINGERPRINT
    ):
        raise ValueError("strategy version/identity mismatch")
    for name in ("cashPaise", "feesPaise", "realizedPaise", "fills"):
        if type(s.get(name)) is not int or abs(s[name]) > 10**15:
            raise ValueError("invalid accounting integer")
    if s["feesPaise"] < 0 or s["fills"] < 0 or len(s["positions"]) > 10:
        raise ValueError("invalid accounting state")
    for key, p in s["positions"].items():
        if (
            p["instrumentKey"] != key
            or p["side"] not in {"BUY", "SELL"}
            or type(p["quantity"]) is not int
            or p["quantity"] <= 0
        ):
            raise ValueError("invalid position")


def nifty_decision(observation: dict[str, Any], date: str, now: int) -> dict[str, Any]:
    at = millis(observation["observedAt"])
    source = millis(observation["quoteTimestamp"])
    target = session_time(date, POLICY["niftySignalMinute"])
    # A delayed first reading must not be mislabeled the original 09:30 signal.
    if not target <= at < target + 60_000 or source > at + 1000 or at - source > 15_000 or at > now:
        raise ValueError("09:30 Nifty observation absent")
    current, previous = paise(observation["lastPrice"]), paise(observation["previousClose"])
    change_bps = (current - previous) * 10_000 / previous
    label = "BULLISH" if change_bps > 20 else "BEARISH" if change_bps < -20 else "MODERATE"
    return {
        "observedAt": at,
        "sourceAt": source,
        "changePct": change_bps / 100,
        "previousClose": previous / 100,
        "lastPrice": current / 100,
        "trend": label,
        "side": "SELL" if label == "BEARISH" else "BUY",
    }


def rank_volume(snapshot: dict[str, Any], date: str, now: int) -> list[dict[str, Any]]:
    cutoff = session_time(date, POLICY["entryMinute"])
    observed = millis(snapshot["observedAt"])
    start = millis(snapshot["startedAt"])
    rows = snapshot["rows"]
    if (
        not cutoff - 60_000 <= start <= observed <= cutoff
        or observed > now
        or snapshot.get("complete") is not True
    ):
        raise ValueError("complete pre-entry universe observation absent")
    if (
        type(snapshot.get("eligibleCount")) is not int
        or not 100 <= len(rows) == snapshot["eligibleCount"] <= 10_000
    ):
        raise ValueError("incomplete market-wide volume coverage")
    identities, symbols, valid = set(), set(), []
    for row in rows:
        key, symbol = row["instrumentKey"], row["symbol"]
        if (
            not key.startswith("NSE_EQ|INE")
            or key in identities
            or symbol in symbols
            or type(row.get("volume")) is not int
            or row["volume"] < 0
        ):
            raise ValueError("invalid/duplicate ranking identity")
        identities.add(key)
        symbols.add(symbol)
        trade_at = millis(row["lastTradeAt"]) if row.get("lastTradeAt") else 0
        if row["volume"] == 0 or trade_at < session_time(date, 555):
            continue
        source_at = millis(row["quoteTimestamp"])
        if not start - 10_000 <= source_at <= observed + 1000 or source_at >= cutoff:
            raise ValueError("future/stale volume in selection")
        if trade_at > observed + 1000:
            raise ValueError("future trade in selection")
        paise(row["lastPrice"])
        valid.append(row)
    valid.sort(key=lambda x: (-x["volume"], x["symbol"]))
    if len(valid) < 10:
        raise ValueError("fewer than ten eligible volume observations")
    return [
        {
            "rank": i + 1,
            "instrumentKey": r["instrumentKey"],
            "symbol": r["symbol"],
            "volume": r["volume"],
            "selectionPrice": r["lastPrice"],
            "volumeAsOf": r["quoteTimestamp"],
        }
        for i, r in enumerate(valid[:10])
    ]


def usable_quote(q: dict[str, Any] | None, now: int, after: int, mode: str = "FORWARD") -> bool:
    try:
        if not q or q["priceUnit"] != "INR":
            return False
        trade, quoted = millis(q["lastTradeAt"]), millis(q["quoteTimestamp"])
        if (
            not after < trade <= now
            or not now - 10_000 <= trade
            or not now - 10_000 <= quoted <= now + 1000
        ):
            return False
        if mode == "HISTORICAL_REPLAY":
            return (
                q.get("executionModel") == "NEXT_MINUTE_OPEN"
                and type(q.get("previousMinuteVolume")) is int
                and q["previousMinuteVolume"] > 0
                and paise(q["lastPrice"]) > 0
                and not q.get("depth")
            )
        bid, ask = q["depth"]["buy"], q["depth"]["sell"]
        b, a = paise(bid["price"]), paise(ask["price"])
        return b <= a <= b * 1.01 and all(
            type(x["quantity"]) is int and x["quantity"] > 0 for x in (bid, ask)
        )
    except (KeyError, ValueError, TypeError, OverflowError):
        return False


def execution_level(q: dict[str, Any], side: str, mode: str) -> tuple[int, int]:
    if mode == "HISTORICAL_REPLAY":
        # Candle history contains no order book. One percent of the PREVIOUS
        # completed minute's volume is an explicit participation assumption.
        return paise(q["lastPrice"]), q["previousMinuteVolume"] // 100
    level = q["depth"]["sell" if side == "BUY" else "buy"]
    return paise(level["price"]), level["quantity"] // 4


def equity(s: dict[str, Any]) -> int:
    result = s["cashPaise"]
    for p in s["positions"].values():
        mark = p["quantity"] * p["markPaise"]
        result += mark if p["side"] == "BUY" else p["collateralPaise"] + p["proceedsPaise"] - mark
    return int(result)


def advance(
    previous: dict[str, Any], inp: dict[str, Any], now: int
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    validate_state(previous)
    s = copy.deepcopy(previous)
    events: list[dict[str, Any]] = []
    observed = millis(inp["observedAt"])
    if (
        inp.get("schema") != "atlas.scalpstorm-owner-input.v1"
        or inp.get("realOrdersEnabled") is not False
        or inp.get("source") != "Upstox Analytics"
    ):
        raise ValueError("untrusted paper source")
    if (
        inp.get("dataClass")
        != ("BROKER_API_OBSERVATION" if s["mode"] == "FORWARD" else "HISTORICAL_CANDLE_SIMULATION")
        or not now - (10_000 if inp.get("market", {}).get("marketOpen") else 90_000)
        <= observed
        <= now + 1000
    ):
        raise ValueError("wrong/stale source class")
    if observed <= s["lastInputAt"]:
        return s, []
    s["lastInputAt"], s["lastSourceAt"] = observed, inp["observedAt"]
    market, t = inp["market"], local(now)
    if (
        market.get("exchange") != "NSE"
        or type(market.get("marketOpen")) is not bool
        or market["marketOpen"] != (market.get("status") == "NORMAL_OPEN")
    ):
        raise ValueError("invalid exchange status")
    if not now - 90_000 <= millis(inp["marketObservedAt"]) <= now + 1000:
        raise ValueError("stale exchange status")
    if not market["marketOpen"] or t.weekday() > 4 or not 555 <= t.hour * 60 + t.minute < 930:
        s["status"] = "MARKET_CLOSED"
        return s, events
    date = t.date().isoformat()
    entry, exit_at = session_time(date, 580), session_time(date, 915)
    entry_window = 60_000 if s["mode"] == "FORWARD" else 120_000
    day = s["days"].setdefault(
        date,
        {
            "date": date,
            "startingEquityPaise": equity(s),
            "selection": None,
            "decision": None,
            "entryAttempted": [],
            "status": "WAITING_0940",
            "fills": 0,
            "feesPaise": 0,
            "realizedPaise": 0,
            "entryAt": entry,
            "exitAt": exit_at,
        },
    )
    quotes = {}
    for q in inp["quotes"]:
        if q["instrumentKey"] in quotes:
            raise ValueError("duplicate execution quote")
        quotes[q["instrumentKey"]] = q
    if now < entry:
        # Never wait until this afternoon to address an unresolved prior-session
        # position. Exit it against new genuine quotes; no new entry is allowed.
        prior_positions = any(
            local(p["entryAt"]).date().isoformat() != date for p in s["positions"].values()
        )
        if not prior_positions:
            s["status"] = "WAITING_0940"
            return s, events
        exit_at = now - 1
    if day["decision"] is None:
        if now >= entry + entry_window or s["positions"]:
            day["decision"] = {
                "at": now,
                "action": "NO_TRADE",
                "reason": "ENTRY_WINDOW_MISSED_OR_UNRESOLVED_POSITION",
            }
        else:
            try:
                selected = rank_volume(inp["ranking"], date, now)
                direction = nifty_decision(inp["niftySignal"], date, now)
                day["selection"] = selected
                day["decision"] = {
                    "at": now,
                    "action": direction["side"],
                    "nifty": direction,
                    "rankingHash": digest(inp["ranking"]),
                    "universeHash": inp["ranking"]["universeHash"],
                    "eligibleCount": inp["ranking"]["eligibleCount"],
                    "reason": "OWNER_VOLUME_AND_NIFTY_RULE",
                }
                s["nifty"], s["ranking"] = (
                    direction,
                    {
                        "selected": selected,
                        "asOf": inp["ranking"]["observedAt"],
                        "eligibleCount": inp["ranking"]["eligibleCount"],
                    },
                )
            except (ValueError, KeyError, TypeError):
                day["decision"] = {
                    "at": now,
                    "action": "NO_TRADE",
                    "reason": "NIFTY_OR_FULL_UNIVERSE_EVIDENCE_MISSING",
                }
        events.append(
            {
                "type": "DECISION",
                "at": now,
                "date": date,
                "decision": day["decision"],
                "selection": day["selection"],
            }
        )
    decision = day["decision"]
    if decision["action"] in {"BUY", "SELL"} and now < entry + entry_window:
        for row in day["selection"]:
            key, side = row["instrumentKey"], decision["action"]
            q = quotes.get(key)
            if (
                key in day["entryAttempted"]
                or key in s["positions"]
                or q is None
                or not usable_quote(q, now, decision["at"], s["mode"])
            ):
                continue
            ref, capacity = execution_level(q, side, s["mode"])
            price = (
                math.ceil(ref * 10005 / 10000) if side == "BUY" else math.floor(ref * 9995 / 10000)
            )
            budget = min(POLICY["slotPaise"], max(0, s["cashPaise"]))
            qty = min(capacity, budget * 10000 // (price * 10010))
            if qty <= 0:
                continue
            gross, fee = qty * price, math.ceil(qty * price / 1000)
            debit = gross + fee if side == "BUY" else budget
            p = {
                "instrumentKey": key,
                "symbol": row["symbol"],
                "side": side,
                "quantity": qty,
                "entryPricePaise": price,
                "entryCostPaise": gross + fee,
                "entryAt": now,
                "markPaise": paise(q["lastPrice"]),
                "markAt": q["lastTradeAt"],
                "collateralPaise": 0 if side == "BUY" else budget,
                "proceedsPaise": 0 if side == "BUY" else gross - fee,
            }
            s["cashPaise"] -= debit
            s["feesPaise"] += fee
            s["positions"][key] = p
            day["entryAttempted"].append(key)
            events.append(
                {
                    "type": "FILL",
                    "phase": "ENTRY",
                    "at": now,
                    "date": date,
                    "side": side,
                    "symbol": row["symbol"],
                    "instrumentKey": key,
                    "quantity": qty,
                    "pricePaise": price,
                    "feePaise": fee,
                    "cashDeltaPaise": -debit,
                    "cashAfterPaise": s["cashPaise"],
                    "realizedPaise": 0,
                    "position": copy.deepcopy(p),
                    "signalAt": decision["at"],
                    "sourceTradeAt": millis(q["lastTradeAt"]),
                    "executionClass": "OBSERVED_QUOTE_MODEL"
                    if s["mode"] == "FORWARD"
                    else "NEXT_BAR_MODEL",
                }
            )
    for key, p in list(s["positions"].items()):
        q = quotes.get(key)
        if q is not None and usable_quote(q, now, p["entryAt"], s["mode"]):
            p["markPaise"], p["markAt"] = paise(q["lastPrice"]), q["lastTradeAt"]
        if (
            q is None
            or now < exit_at
            or not usable_quote(q, now, max(exit_at - 1, p["entryAt"]), s["mode"])
        ):
            continue
        close_side = "SELL" if p["side"] == "BUY" else "BUY"
        ref, capacity = execution_level(q, close_side, s["mode"])
        if capacity < p["quantity"]:
            continue
        price = (
            math.floor(ref * 9995 / 10000)
            if close_side == "SELL"
            else math.ceil(ref * 10005 / 10000)
        )
        gross = price * p["quantity"]
        fee = math.ceil(gross / 1000)
        credit = (
            gross - fee
            if p["side"] == "BUY"
            else p["collateralPaise"] + p["proceedsPaise"] - gross - fee
        )
        realized = (
            gross - fee - p["entryCostPaise"]
            if p["side"] == "BUY"
            else p["proceedsPaise"] - gross - fee
        )
        s["cashPaise"] += credit
        s["feesPaise"] += fee
        s["realizedPaise"] += realized
        del s["positions"][key]
        events.append(
            {
                "type": "FILL",
                "phase": "EXIT",
                "at": now,
                "date": date,
                "side": close_side,
                "symbol": p["symbol"],
                "instrumentKey": key,
                "quantity": p["quantity"],
                "pricePaise": price,
                "feePaise": fee,
                "cashDeltaPaise": credit,
                "cashAfterPaise": s["cashPaise"],
                "realizedPaise": realized,
                "signalAt": exit_at - 1,
                "sourceTradeAt": millis(q["lastTradeAt"]),
                "reason": "1515_SESSION_EXIT",
                "executionClass": "OBSERVED_QUOTE_MODEL"
                if s["mode"] == "FORWARD"
                else "NEXT_BAR_MODEL",
            }
        )
    for event in events:
        if event["type"] == "FILL":
            s["fills"] += 1
            day["fills"] += 1
            day["feesPaise"] += event["feePaise"]
            day["realizedPaise"] += event["realizedPaise"]
    day["endingEquityPaise"] = equity(s)
    day["complete"] = now >= session_time(date, 915) and not s["positions"]
    day["status"] = (
        "NO_TRADE"
        if decision["action"] == "NO_TRADE"
        else "OPEN_POSITIONS"
        if s["positions"]
        else "SESSION_COMPLETE"
        if now >= exit_at
        else "WAITING_NEXT_TRADE"
        if now < entry + entry_window
        else "NO_FILLED_ENTRIES"
    )
    s["status"] = day["status"]
    validate_state(s)
    return s, events


def period_summaries(days: dict[str, Any], width: int) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for day in days.values():
        if day.get("complete") is True:
            groups.setdefault(day["date"][:width], []).append(day)
    result = []
    for period, rows in sorted(groups.items(), reverse=True):
        rows.sort(key=lambda d: d["date"])
        pnl = sum(d["endingEquityPaise"] - d["startingEquityPaise"] for d in rows)
        result.append(
            {
                "period": period,
                "completedSessions": len(rows),
                "firstSession": rows[0]["date"],
                "lastSession": rows[-1]["date"],
                "netPnlINR": pnl / 100,
                "returnPct": pnl * 100 / rows[0]["startingEquityPaise"]
                if rows[0]["startingEquityPaise"] > 0
                else None,
                "feesINR": sum(d["feesPaise"] for d in rows) / 100,
                "fills": sum(d["fills"] for d in rows),
                "coverage": "Recorded completed sessions only; incomplete calendar periods",
            }
        )
    return result


def summary(s: dict[str, Any], events: list[dict[str, Any]], now: int) -> dict[str, Any]:
    validate_state(s)
    return {
        "schema": "atlas.scalpstorm-owner-report.v1",
        "strategyId": POLICY["strategyId"],
        "name": "ScalpStorm X · 09:40",
        "mode": s["mode"],
        "observedAt": iso(now),
        "sourceObservedAt": s["lastSourceAt"],
        "status": s["status"],
        "paperOnly": True,
        "realOrdersEnabled": False,
        "actualCapitalINR": 0,
        "virtualCapitalINR": 100000,
        "allocationPerStockINR": 10000,
        "policy": POLICY,
        "cashINR": s["cashPaise"] / 100,
        "equityINR": equity(s) / 100,
        "realizedPnlINR": s["realizedPaise"] / 100,
        "netPnlINR": (equity(s) - 10_000_000) / 100,
        "feesINR": s["feesPaise"] / 100,
        "fills": s["fills"],
        "positions": list(s["positions"].values()),
        "days": sorted(s["days"].values(), key=lambda x: x["date"], reverse=True)[:400],
        "monthly": period_summaries(s["days"], 7),
        "yearly": period_summaries(s["days"], 4),
        "events": events[-200:],
        "nifty": s["nifty"],
        "ranking": s["ranking"],
        "costModel": (
            "Illustrative 0.10% costs and 0.05% slippage per side; "
            "actual broker/tax execution unverified"
        ),
        "shortAccounting": (
            "Full slot cash collateral; short sale proceeds locked until cover; no reinvestment"
        ),
        "qualified": False,
        "ledgerVerified": True,
    }


class OwnerStore:
    def __init__(self, path: Path, now: int, *, read_only: bool = False, mode: str = "FORWARD"):
        self.read_only = read_only
        if path.is_symlink() or path.parent.is_symlink():
            raise ValueError("unsafe journal path")
        if not read_only:
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if path.parent.stat().st_mode & 0o077 or path.parent.stat().st_uid != os.getuid():
            raise ValueError("private journal directory required")
        if path.exists() and (path.stat().st_mode & 0o077 or path.stat().st_uid != os.getuid()):
            raise ValueError("private journal required")
        self.db = sqlite3.connect(f"file:{path}?mode=ro" if read_only else path, uri=read_only)
        self.db.row_factory = sqlite3.Row
        if not read_only:
            os.chmod(path, 0o600)
            self.db.execute("PRAGMA journal_mode=WAL")
            self.db.execute("PRAGMA synchronous=FULL")
            self.db.executescript(
                "CREATE TABLE IF NOT EXISTS owner_state("
                "id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,"
                "hash TEXT NOT NULL,head TEXT NOT NULL); "
                "CREATE TABLE IF NOT EXISTS owner_events("
                "seq INTEGER PRIMARY KEY,payload TEXT NOT NULL,"
                "prev TEXT NOT NULL,hash TEXT NOT NULL);"
            )
            if not self.db.execute("SELECT 1 FROM owner_state").fetchone():
                state = new_state(now, mode)
                self.db.execute(
                    "INSERT INTO owner_state VALUES(1,?,?,?)",
                    (json.dumps(state), digest([state, "GENESIS"]), "GENESIS"),
                )
                self.db.commit()
        self.verify()

    def close(self) -> None:
        self.db.close()

    def load(self) -> tuple[dict[str, Any], str]:
        row = self.db.execute("SELECT * FROM owner_state WHERE id=1").fetchone()
        if not row:
            raise ValueError("journal state absent")
        s = json.loads(row["payload"])
        validate_state(s)
        if digest([s, row["head"]]) != row["hash"]:
            raise ValueError("journal state checksum mismatch")
        return s, row["head"]

    def verify(self) -> None:
        s, expected = self.load()
        head, cash, fees, realized, fills, positions = "GENESIS", 10_000_000, 0, 0, 0, {}
        for seq, row in enumerate(self.db.execute("SELECT * FROM owner_events ORDER BY seq"), 1):
            e = json.loads(row["payload"])
            if row["seq"] != seq or row["prev"] != head or row["hash"] != digest([head, e]):
                raise ValueError("journal hash chain corrupt")
            head = row["hash"]
            if e["type"] != "FILL":
                continue
            if (
                e["sourceTradeAt"] <= e["signalAt"]
                or type(e["quantity"]) is not int
                or e["quantity"] <= 0
                or e["feePaise"] != math.ceil(e["quantity"] * e["pricePaise"] / 1000)
            ):
                raise ValueError("fill causality/accounting corrupt")
            key = e["instrumentKey"]
            if e["phase"] == "ENTRY":
                if key in positions or e["quantity"] * e["pricePaise"] + e["feePaise"] > 1_000_000:
                    raise ValueError("allocation corrupt")
                p = e["position"]
                expected_delta = (
                    -p["entryCostPaise"] if e["side"] == "BUY" else -p["collateralPaise"]
                )
                positions[key] = p
            else:
                p = positions.pop(key)
                gross = e["quantity"] * e["pricePaise"]
                expected_delta = (
                    gross - e["feePaise"]
                    if p["side"] == "BUY"
                    else p["collateralPaise"] + p["proceedsPaise"] - gross - e["feePaise"]
                )
                pnl = (
                    gross - e["feePaise"] - p["entryCostPaise"]
                    if p["side"] == "BUY"
                    else p["proceedsPaise"] - gross - e["feePaise"]
                )
                if pnl != e["realizedPaise"] or e["quantity"] != p["quantity"]:
                    raise ValueError("realized P/L corrupt")
            if expected_delta != e["cashDeltaPaise"]:
                raise ValueError("cash movement corrupt")
            cash += expected_delta
            fees += e["feePaise"]
            realized += e["realizedPaise"]
            fills += 1
            if cash != e["cashAfterPaise"]:
                raise ValueError("cash receipt corrupt")
        if (
            head != expected
            or (cash, fees, realized, fills)
            != (s["cashPaise"], s["feesPaise"], s["realizedPaise"], s["fills"])
            or set(positions) != set(s["positions"])
        ):
            raise ValueError("state differs from immutable accounting")
        for key, p in positions.items():
            for name in (
                "quantity",
                "entryCostPaise",
                "entryPricePaise",
                "side",
                "collateralPaise",
                "proceedsPaise",
            ):
                if p[name] != s["positions"][key][name]:
                    raise ValueError("position differs from immutable fill")

    def advance(self, inp: dict[str, Any], now: int) -> None:
        if self.read_only:
            raise ValueError("read-only journal")
        self.db.execute("BEGIN IMMEDIATE")
        try:
            old, head = self.load()
            s, events = advance(old, inp, now)
            for event in events:
                nxt = digest([head, event])
                self.db.execute(
                    "INSERT INTO owner_events(payload,prev,hash) VALUES(?,?,?)",
                    (json.dumps(event), head, nxt),
                )
                head = nxt
            self.db.execute(
                "UPDATE owner_state SET payload=?,hash=?,head=? WHERE id=1",
                (json.dumps(s), digest([s, head]), head),
            )
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def report(self, now: int) -> dict[str, Any]:
        self.verify()
        s, head = self.load()
        events = [
            json.loads(r[0])
            for r in self.db.execute("SELECT payload FROM owner_events ORDER BY seq DESC LIMIT 200")
        ][::-1]
        return {**summary(s, events, now), "ledgerHead": head}
