"""Full eligible cash-universe observations through Atlas's pinned GET transport."""

from __future__ import annotations

import datetime as dt
import gzip
import hashlib
import io
import json
import math
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from urllib.parse import quote

from atlas.integrations.nse_snapshot import _timestamp
from atlas.market.read_only_transport import (
    NSE_INSTRUMENT_MASTER_URL,
    market_data_get,
    nse_instrument_master_get,
)

NIFTY = "NSE_INDEX|Nifty 50"


def universe_from_bytes(raw: bytes, now: dt.datetime) -> dict[str, Any]:
    if now.tzinfo is None or not 0 < len(raw) <= 8_000_000:
        raise ValueError("invalid universe source")
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream:
        expanded = stream.read(160_000_001)
    if len(expanded) > 160_000_000:
        raise ValueError("oversized universe source")
    rows = json.loads(expanded)
    if not isinstance(rows, list):
        raise ValueError("invalid universe source collection")
    chosen: dict[str, dict[str, Any]] = {}
    symbols: set[str] = set()
    for row in rows:
        if (
            not isinstance(row, dict)
            or row.get("segment") != "NSE_EQ"
            or row.get("exchange") != "NSE"
            or row.get("instrument_type") != "EQ"
            or row.get("security_type") != "NORMAL"
            or row.get("lot_size") != 1
        ):
            continue
        key, symbol = row.get("instrument_key"), row.get("trading_symbol")
        if (
            not isinstance(key, str)
            or not re.fullmatch(r"NSE_EQ\|INE[A-Z0-9]{9}", key)
            or not isinstance(symbol, str)
            or not re.fullmatch(r"[A-Z0-9&_.-]{1,40}", symbol)
        ):
            continue
        if key in chosen or symbol in symbols:
            raise ValueError("ambiguous eligible cash-equity identity")
        chosen[key] = {"instrumentKey": key, "symbol": symbol, "lotSize": 1}
        symbols.add(symbol)
    if not 100 <= len(chosen) <= 10_000:
        raise ValueError("unexpected broad-universe coverage")
    return {
        "schema": "atlas.owner-nse-universe.v1",
        "observedAt": now.isoformat(),
        "source": NSE_INSTRUMENT_MASTER_URL,
        "payloadSHA256": hashlib.sha256(raw).hexdigest(),
        "historicalPointInTimeUniverse": False,
        "eligibility": "NSE_EQ / EQ / NORMAL / one-share lot / INE ISIN",
        "instruments": sorted(chosen.values(), key=lambda r: r["symbol"]),
    }


def fetch_universe() -> dict[str, Any]:
    return universe_from_bytes(nse_instrument_master_get(), dt.datetime.now(dt.UTC))


def _number(v: Any, *, positive: bool = False) -> float | None:
    if (
        isinstance(v, bool)
        or not isinstance(v, (int, float))
        or not math.isfinite(v)
        or v < 0
        or v > 1e12
        or (positive and v == 0)
    ):
        return None
    return float(v)


def provider_timestamp(value: Any, received: dt.datetime) -> str | None:
    # Provider zero means no reported exchange event, not a fresh timestamp.
    return None if value in (0, "0", None, "") else _timestamp(value, received)


def fetch_quotes(
    watch: dict[str, str], token: str, *, getter: Any = market_data_get
) -> tuple[list[dict[str, Any]], str]:
    if (
        not 1 <= len(watch) <= 200
        or not token
        or any(not re.fullmatch(r"NSE_(?:EQ|INDEX)\|[A-Za-z0-9 _&.-]{2,64}", key) for key in watch)
    ):
        raise ValueError("invalid bounded market-data request")
    response = getter(
        "https://api.upstox.com/v3/market-quote/quotes?instrument_key="
        + quote(",".join(watch), safe=""),
        {"Accept": "application/json", "Authorization": f"Bearer {token}"},
    )
    received = dt.datetime.now(dt.UTC)
    if (
        not isinstance(response, dict)
        or response.get("status") != "success"
        or not isinstance(response.get("data"), dict)
    ):
        raise ValueError("market quote data absent")
    found: dict[str, dict[str, Any]] = {}
    for raw in response["data"].values():
        if not isinstance(raw, dict):
            raise ValueError("invalid quote row")
        key = raw.get("instrument_token")
        if key not in watch or key in found:
            raise ValueError("quote identity mismatch")
        volume = raw.get("volume")
        if not key.startswith("NSE_INDEX|") and (type(volume) is not int or volume < 0):
            raise ValueError("share volume unavailable")
        price = _number(raw.get("last_price"))
        if price is None:
            raise ValueError("invalid market price")
        levels = {}
        for side in ("buy", "sell"):
            entries = (
                raw.get("depth", {}).get(side, []) if isinstance(raw.get("depth"), dict) else []
            )
            first = entries[0] if entries and isinstance(entries[0], dict) else {}
            qty = first.get("quantity")
            levels[side] = {
                "price": _number(first.get("price"), positive=True),
                "quantity": qty if type(qty) is int and qty >= 0 else 0,
            }
        previous_close = _number(raw.get("prev_close_price"), positive=True)
        close_method = "PROVIDER_PREVIOUS_CLOSE" if previous_close is not None else "UNAVAILABLE"
        change = raw.get("net_change")
        if (
            previous_close is None
            and key.startswith("NSE_INDEX|")
            and not isinstance(change, bool)
            and isinstance(change, (int, float))
            and math.isfinite(change)
        ):
            previous_close = _number(price - change, positive=True)
            if previous_close is not None:
                close_method = "LAST_PRICE_MINUS_NET_CHANGE"
        found[key] = {
            "instrumentKey": key,
            "symbol": watch[key],
            "lastPrice": price,
            "priceUnit": "POINTS" if key.startswith("NSE_INDEX|") else "INR",
            "volume": volume,
            "lastTradeAt": provider_timestamp(raw.get("last_trade_time"), received),
            "quoteTimestamp": provider_timestamp(raw.get("timestamp"), received),
            "depth": levels,
            "previousClose": previous_close,
            "previousCloseMethod": close_method,
            "observedAt": received.isoformat(),
        }
    return list(found.values()), hashlib.sha256(
        json.dumps(response, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def broad_snapshot(universe: dict[str, Any], token: str) -> dict[str, Any]:
    started = dt.datetime.now(dt.UTC).isoformat()
    items = universe["instruments"]
    rows, hashes = [], []
    chunks = [items[start : start + 200] for start in range(0, len(items), 200)]

    def capture(chunk: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], str]:
        return fetch_quotes({r["instrumentKey"]: r["symbol"] for r in chunk}, token)

    # Four bounded GETs concurrently keep the full cash universe inside the
    # pre-entry window; one failed batch invalidates the entire observation.
    with ThreadPoolExecutor(max_workers=4) as pool:
        for data, raw_hash in pool.map(capture, chunks):
            rows.extend(data)
            hashes.append(raw_hash)
    return {
        "observedAt": dt.datetime.now(dt.UTC).isoformat(),
        "startedAt": started,
        "eligibleCount": len(items),
        "receivedCount": len(rows),
        "complete": len(rows) == len(items),
        "universeHash": universe["payloadSHA256"],
        "sourcePayloadHashes": hashes,
        "rows": rows,
    }
