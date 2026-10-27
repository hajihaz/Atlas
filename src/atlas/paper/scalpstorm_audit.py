"""Read-only independent financial and source-receipt audit of the owner paper journal."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
import os
import re
import sqlite3
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from atlas.paper.scalpstorm_owner import ENGINE_FINGERPRINT, POLICY

IST = ZoneInfo("Asia/Kolkata")


def _sha(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()


def _ms(value: str) -> int:
    time = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if time.tzinfo is None:
        raise ValueError("source timezone missing")
    return round(time.timestamp() * 1000)


def _time(date: str, minute: int) -> int:
    return _ms(f"{date}T{minute // 60:02}:{minute % 60:02}:00+05:30")


def _price(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("source price invalid")
    if not math.isfinite(value) or value <= 0:
        raise ValueError("source price invalid")
    return math.floor(value * 100 + 0.5)


def _private(path: Path, maximum: int = 8_000_000) -> None:
    for parent in (path.parent, path):
        info = parent.lstat()
        if parent.is_symlink() or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError("private audit evidence required")
    if not path.is_file() or path.stat().st_size > maximum:
        raise ValueError("bounded audit evidence required")


def _read(path: Path) -> dict[str, Any]:
    _private(path)
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError("audit object required")
    return value


def _check_selection(root: Path, inp: dict[str, Any], event: dict[str, Any], date: str) -> None:
    rank, decision = inp["ranking"], event["decision"]
    cutoff = _time(date, 580)
    start, observed = _ms(rank["startedAt"]), _ms(rank["observedAt"])
    rows = rank["rows"]
    if not (
        cutoff - 60_000 <= start <= observed <= cutoff
        and rank["complete"] is True
        and 100 <= len(rows) == rank["eligibleCount"] <= 10_000
        and _sha(rank) == decision["rankingHash"]
        and rank["universeHash"] == decision["universeHash"]
    ):
        raise ValueError("timed full-universe ranking differs")
    valid, keys, symbols = [], set(), set()
    for row in rows:
        key, symbol, volume = row["instrumentKey"], row["symbol"], row["volume"]
        if (
            not key.startswith("NSE_EQ|INE")
            or key in keys
            or symbol in symbols
            or type(volume) is not int
            or volume < 0
        ):
            raise ValueError("ranking identities or volume invalid")
        keys.add(key)
        symbols.add(symbol)
        trade = _ms(row["lastTradeAt"]) if row.get("lastTradeAt") else 0
        if volume == 0 or trade < _time(date, 555):
            continue
        quoted = _ms(row["quoteTimestamp"])
        if not start - 10_000 <= quoted <= observed + 1000 or quoted >= cutoff:
            raise ValueError("ranking source clock invalid")
        if trade > observed + 1000:
            raise ValueError("ranking contains future trade")
        valid.append(row)
    valid.sort(key=lambda row: (-row["volume"], row["symbol"]))
    selected = event["selection"]
    if len(selected) != 10 or len(valid) < 10:
        raise ValueError("ten source selections required")
    for source, actual in zip(valid[:10], selected, strict=True):
        if any(source[k] != actual[k] for k in ("instrumentKey", "symbol", "volume")):
            raise ValueError("selected volume leaders differ")
    nifty = inp["niftySignal"]
    at, quoted = _ms(nifty["observedAt"]), _ms(nifty["quoteTimestamp"])
    if not (
        _time(date, 570) <= at < _time(date, 571)
        and quoted <= at + 1000
        and at - quoted <= 15_000
        and at <= event["at"]
        and nifty.get("previousCloseMethod")
        in {"PROVIDER_PREVIOUS_CLOSE", "LAST_PRICE_MINUS_NET_CHANGE"}
    ):
        raise ValueError("frozen Nifty source evidence missing")
    current, previous = _price(nifty["lastPrice"]), _price(nifty["previousClose"])
    history = _read(root / "scalpstorm-history.json")
    prices = history["prices"]
    previous_date = dt.date.fromisoformat(nifty["previousCloseDate"])
    age = (dt.date.fromisoformat(date) - previous_date).days
    references = [b for b in prices["bars"] if b["time"][:10] == previous_date.isoformat()]
    if not (
        history["schema"] == "atlas.scalpstorm-history.v1"
        and prices["instrumentKey"] == "NSE_INDEX|Nifty 50"
        and prices["source"] == "Upstox Analytics V3 / days / 1"
        and 0 < age <= 7
        and len(references) == 1
        and _price(references[0]["close"]) == previous
    ):
        raise ValueError("Nifty previous close differs from daily source history")
    bps = (current - previous) * 10_000 / previous
    trend = "BULLISH" if bps > 20 else "BEARISH" if bps < -20 else "MODERATE"
    side = "SELL" if trend == "BEARISH" else "BUY"
    actual = decision["nifty"]
    if (
        decision["action"] != side
        or actual["trend"] != trend
        or actual["previousClose"] != previous / 100
        or actual["lastPrice"] != current / 100
        or abs(actual["changePct"] - bps / 100) > 1e-9
    ):
        raise ValueError("Nifty direction differs from source")


def _check_group(root: Path, date: str, at: int, before: str, events: list[dict[str, Any]]) -> None:
    intent = _read(root / "scalpstorm-processing" / date / (str(at) + ".json"))
    if (
        intent["schema"] != "atlas.scalpstorm-processing.v1"
        or intent["processedAt"] != at
        or intent["beforeLedgerHead"] != before
    ):
        raise ValueError("pre-mutation processing receipt differs")
    stamp = _ms(intent["sourceObservedAt"])
    source_date = dt.datetime.fromtimestamp(stamp / 1000, dt.UTC).date().isoformat()
    folder = root / "scalpstorm-observations" / source_date
    receipt = _read(folder / (str(stamp) + ".json"))
    inp = receipt["input"]
    ranking_hash = receipt["rankingSHA256"]
    if ranking_hash is not None:
        if not isinstance(ranking_hash, str) or len(ranking_hash) != 64:
            raise ValueError("ranking reference invalid")
        if not re.fullmatch(r"[0-9a-f]{64}", ranking_hash):
            raise ValueError("ranking reference invalid")
        ranking = _read(folder / ("ranking-" + ranking_hash + ".json"))
        if _sha(ranking) != ranking_hash:
            raise ValueError("ranking receipt checksum differs")
    else:
        ranking = None
    inp = {**inp, "ranking": ranking}
    if _sha(inp) != receipt["inputSHA256"] or receipt["inputSHA256"] != intent["inputSHA256"]:
        raise ValueError("exact source input checksum differs")
    if not (
        inp["schema"] == "atlas.scalpstorm-owner-input.v1"
        and inp["source"] == "Upstox Analytics"
        and inp["dataClass"] == "BROKER_API_OBSERVATION"
        and inp["realOrdersEnabled"] is False
        and inp["market"] == {"exchange": "NSE", "status": "NORMAL_OPEN", "marketOpen": True}
        and at - 10_000 <= stamp <= at + 1000
        and at - 90_000 <= _ms(inp["marketObservedAt"]) <= at + 1000
    ):
        raise ValueError("genuine fresh open-market source class required")
    quotes = {q["instrumentKey"]: q for q in inp["quotes"]}
    if len(quotes) != len(inp["quotes"]):
        raise ValueError("duplicate source quote")
    for event in events:
        if event["type"] == "DECISION":
            if event["decision"]["action"] in {"BUY", "SELL"}:
                _check_selection(root, inp, event, date)
            continue
        q = quotes[event["instrumentKey"]]
        trade, quoted = _ms(q["lastTradeAt"]), _ms(q["quoteTimestamp"])
        if not (
            q["priceUnit"] == "INR"
            and event["signalAt"] < trade <= at
            and trade == event["sourceTradeAt"]
            and at - trade <= 10_000
            and at - 10_000 <= quoted <= at + 1000
        ):
            raise ValueError("fill source trade is stale or not causal")
        bid, ask = q["depth"]["buy"], q["depth"]["sell"]
        b, a = _price(bid["price"]), _price(ask["price"])
        if not b <= a or a * 100 > b * 101:
            raise ValueError("fill source spread invalid")
        if any(type(x["quantity"]) is not int or x["quantity"] <= 0 for x in (bid, ask)):
            raise ValueError("fill source book unavailable")
        level = ask if event["side"] == "BUY" else bid
        ref = _price(level["price"])
        price = (ref * 10005 + 9999) // 10000 if event["side"] == "BUY" else ref * 9995 // 10000
        if event["pricePaise"] != price or event["quantity"] > level["quantity"] // 4:
            raise ValueError("fill differs from source price or liquidity capacity")
        if event["phase"] == "EXIT":
            entry_date = (
                dt.datetime.fromtimestamp(event["auditEntryAt"] / 1000, IST).date().isoformat()
            )
            if entry_date == date and at < _time(date, 915):
                raise ValueError("exit precedes target time")
        if event["phase"] == "ENTRY":
            budget = min(1_000_000, max(0, event["auditCashBefore"]))
            quantity = min(level["quantity"] // 4, budget * 10000 // (price * 10010))
            if event["quantity"] != quantity or not _time(date, 580) <= at < _time(date, 581):
                raise ValueError("entry allocation or timing differs")


def audit_session(root: Path, date: str | None = None) -> dict[str, Any]:
    journal = root / "scalpstorm-owner.sqlite3"
    _private(journal, 1_000_000_000)
    with sqlite3.connect(f"file:{journal}?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        db.execute("BEGIN")
        state_row = db.execute("SELECT * FROM owner_state WHERE id=1").fetchone()
        rows = db.execute("SELECT * FROM owner_events ORDER BY seq").fetchall()
    if state_row is None:
        raise ValueError("owner state absent")
    s = json.loads(state_row["payload"])
    if (
        s["mode"] != "FORWARD"
        or s["engineFingerprint"] != ENGINE_FINGERPRINT
        or s["policyHash"] != _sha(POLICY)
        or _sha([s, state_row["head"]]) != state_row["hash"]
    ):
        raise ValueError("owner identity or state checksum differs")
    target = date or max(s["days"], default=dt.datetime.now(IST).date().isoformat())
    if dt.date.fromisoformat(target).isoformat() != target:
        raise ValueError("session date invalid")
    head, cash, fees, realized, fills = "GENESIS", 10_000_000, 0, 0, 0
    positions: dict[str, Any] = {}
    target_positions: dict[str, Any] = {}
    groups: dict[int, tuple[str, list[dict[str, Any]]]] = {}
    entries = exits = 0
    started_flat: bool | None = None
    for seq, row in enumerate(rows, 1):
        event = json.loads(row["payload"])
        if row["seq"] != seq or row["prev"] != head or row["hash"] != _sha([head, event]):
            raise ValueError("immutable event chain differs")
        prior_head, head = head, row["hash"]
        e = {**event, "auditCashBefore": cash}
        if e["date"] == target:
            if started_flat is None:
                started_flat = not positions
            groups.setdefault(e["at"], (prior_head, []))[1].append(e)
        if e["type"] != "FILL":
            if e["date"] == target:
                target_positions = dict(positions)
            continue
        quantity, price = e["quantity"], e["pricePaise"]
        if type(quantity) is not int or quantity <= 0 or type(price) is not int or price <= 0:
            raise ValueError("fill integers invalid")
        gross = quantity * price
        fee = (gross + 999) // 1000
        if fee != e["feePaise"] or not e["signalAt"] < e["sourceTradeAt"] <= e["at"]:
            raise ValueError("fill fee or causality differs")
        key = e["instrumentKey"]
        if e["phase"] == "ENTRY":
            if key in positions or gross + fee > 1_000_000:
                raise ValueError("slot allocation differs")
            budget = min(1_000_000, max(0, cash))
            if e["side"] not in {"BUY", "SELL"}:
                raise ValueError("entry side invalid")
            p = {
                "side": e["side"],
                "quantity": quantity,
                "entryCostPaise": gross + fee,
                "entryAt": e["at"],
                "entryPricePaise": price,
                "collateralPaise": budget if e["side"] == "SELL" else 0,
                "proceedsPaise": gross - fee if e["side"] == "SELL" else 0,
            }
            if any(e["position"][name] != value for name, value in p.items()):
                raise ValueError("entry position accounting differs")
            positions[key] = p
            delta = -budget if e["side"] == "SELL" else -gross - fee
            if e["date"] == target:
                entries += 1
        elif e["phase"] == "EXIT":
            p = positions.pop(key)
            e["auditEntryAt"] = p["entryAt"]
            if e["side"] != ("SELL" if p["side"] == "BUY" else "BUY"):
                raise ValueError("exit side differs")
            if quantity != p["quantity"]:
                raise ValueError("exit quantity differs")
            delta = (
                gross - fee
                if p["side"] == "BUY"
                else p["collateralPaise"] + p["proceedsPaise"] - gross - fee
            )
            pnl = (
                gross - fee - p["entryCostPaise"]
                if p["side"] == "BUY"
                else p["proceedsPaise"] - gross - fee
            )
            if pnl != e["realizedPaise"]:
                raise ValueError("realized result differs")
            realized += pnl
            if e["date"] == target:
                exits += 1
        else:
            raise ValueError("fill phase invalid")
        cash += delta
        fees += fee
        fills += 1
        if e["cashDeltaPaise"] != delta or e["cashAfterPaise"] != cash:
            raise ValueError("cash movement differs")
        if e["date"] == target:
            target_positions = dict(positions)
    if (
        head != state_row["head"]
        or (cash, fees, realized, fills)
        != (s["cashPaise"], s["feesPaise"], s["realizedPaise"], s["fills"])
        or set(positions) != set(s["positions"])
    ):
        raise ValueError("journal accounting state differs")
    for key, p in positions.items():
        if any(s["positions"][key][name] != value for name, value in p.items()):
            raise ValueError("open position accounting differs")
    verified, missing, invalid, selection = 0, 0, [], False
    for at, (before, events) in groups.items():
        try:
            _check_group(root, target, at, before, events)
            verified += 1
            selection |= any(
                e["type"] == "DECISION" and e["decision"]["action"] in {"BUY", "SELL"}
                for e in events
            )
        except FileNotFoundError:
            missing += 1
        except (KeyError, TypeError, ValueError, OSError) as error:
            invalid.append({"at": at, "reason": str(error)[:160]})
    day = s["days"].get(target, {})
    accepted = bool(
        groups
        and entries > 0
        and entries == exits
        and started_flat
        and day.get("complete") is True
        and not target_positions
        and missing == 0
        and not invalid
        and selection
    )
    return {
        "schema": "atlas.scalpstorm-audit.v1",
        "strategyId": "scalpstorm_x_0940",
        "sessionDate": target,
        "verifiedAt": dt.datetime.now(dt.UTC).isoformat(),
        "paperOnly": True,
        "realOrdersEnabled": False,
        "actualCapitalINR": 0,
        "accountingVerified": True,
        "ledgerHead": head,
        "entries": entries,
        "exits": exits,
        "openPositions": len(target_positions if groups else positions),
        "accountOpenPositions": len(positions),
        "sourceGroupsVerified": verified,
        "sourceGroupsMissing": missing,
        "sourceGroupsInvalid": invalid[:10],
        "timedSelectionVerified": selection,
        "sessionAccepted": accepted,
        "qualified": False,
        "status": "VERIFIED_PAPER_SESSION"
        if accepted
        else "OPEN_POSITIONS"
        if (target_positions if groups else positions)
        else "SOURCE_EVIDENCE_MISSING"
        if missing or invalid
        else "WAITING_COMPLETE_SESSION",
        "note": (
            "Operational paper-session evidence only; not profitability qualification. "
            "Missing first-session source receipts are never reconstructed."
        ),
    }
