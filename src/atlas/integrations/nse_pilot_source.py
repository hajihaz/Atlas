"""Pinned, owner-only source bridge for the fixed NSE paper pilot. GET data only."""

from __future__ import annotations

import datetime as dt
import gzip
import hashlib
import io
import json
import re
from urllib.parse import quote

from atlas.integrations.nse_snapshot import market_snapshot
from atlas.integrations.nse_sources import IST, JsonGet, _get_json, _parse_bars
from atlas.market.read_only_transport import (
    NSE_INSTRUMENT_MASTER_URL,
    nse_instrument_master_get,
)

SYMBOLS = (
    "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK",
    "SBIN", "ITC", "LT", "BHARTIARTL", "HINDUNILVR",
)
MASTER_URL = NSE_INSTRUMENT_MASTER_URL


def universe_from_payload(raw: bytes, *, observed_at: dt.datetime) -> dict[str, object]:
    if observed_at.tzinfo is None or len(raw) > 8_000_000:
        raise ValueError("invalid instrument payload or receive time")
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream:
            expanded = stream.read(160_000_001)
        if len(expanded) > 160_000_000:
            raise ValueError("oversized instrument master")
        rows = json.loads(expanded)
    except (OSError, ValueError):
        raise ValueError("invalid bounded instrument master") from None
    if not isinstance(rows, list):
        raise ValueError("invalid instrument master collection")
    selected = {}
    for row in rows:
        if not isinstance(row, dict) or row.get("trading_symbol") not in SYMBOLS:
            continue
        if row.get("segment") != "NSE_EQ" or row.get("instrument_type") != "EQ":
            continue
        key = row.get("instrument_key")
        symbol = row["trading_symbol"]
        if (
            symbol in selected
            or row.get("exchange") != "NSE"
            or row.get("lot_size") != 1
            or row.get("security_type") != "NORMAL"
            or not isinstance(key, str)
            or not re.fullmatch(r"NSE_EQ\|INE[A-Z0-9]{9}", key)
        ):
            raise ValueError("ambiguous or ineligible fixed pilot identity")
        selected[symbol] = {"symbol": symbol, "instrumentKey": key, "lotSize": 1}
    if set(selected) != set(SYMBOLS):
        raise ValueError("fixed ten-stock pilot identities incomplete")
    return {
        "schema": "atlas.nse-pilot-universe.v1",
        "classification": "FIXED_TEN_STOCK_PILOT_NOT_MARKET_WIDE_TOP_TEN",
        "source": MASTER_URL,
        "observedAt": observed_at.astimezone(dt.UTC).isoformat(),
        "payloadSHA256": hashlib.sha256(raw).hexdigest(),
        "instruments": [selected[s] for s in SYMBOLS],
        "historicalPointInTimeUniverse": False,
    }


def fetch_universe() -> dict[str, object]:
    raw = nse_instrument_master_get()
    return universe_from_payload(raw, observed_at=dt.datetime.now(dt.UTC))


def pilot_watchlist(universe: dict[str, object]) -> dict[str, str]:
    rows = universe.get("instruments")
    if (
        universe.get("schema") != "atlas.nse-pilot-universe.v1"
        or not isinstance(rows, list) or len(rows) != 10
    ):
        raise ValueError("invalid pilot universe")
    result = {}
    for index, row in enumerate(rows):
        if (
            not isinstance(row, dict) or row.get("symbol") != SYMBOLS[index]
            or row.get("lotSize") != 1
            or not isinstance(row.get("instrumentKey"), str)
            or not re.fullmatch(r"NSE_EQ\|INE[A-Z0-9]{9}", row["instrumentKey"])
        ):
            raise ValueError("untrusted pilot instrument identity")
        result[row["instrumentKey"]] = row["symbol"]
    if len(result) != 10:
        raise ValueError("duplicate pilot identities")
    return result


def intraday_bars(
    instrument: str, *, token: str, received_at: dt.datetime | None = None,
    getter: JsonGet = _get_json,
) -> list[dict[str, object]]:
    if not re.fullmatch(r"NSE_EQ\|INE[A-Z0-9]{9}", instrument) or not token:
        raise ValueError("approved equity identity and Analytics credential required")
    obj = getter(
        "https://api.upstox.com/v3/historical-candle/intraday/"
        + quote(instrument, safe="") + "/minutes/1",
        {"Accept": "application/json", "Authorization": f"Bearer {token}"},
    )
    received = received_at or dt.datetime.now(dt.UTC)
    if received.tzinfo is None or not isinstance(obj, dict) or obj.get("status") != "success":
        raise ValueError("invalid intraday response")
    data = obj.get("data")
    if not isinstance(data, dict) or not isinstance(data.get("candles"), list):
        raise ValueError("intraday candles missing")
    rows = _parse_bars(data["candles"], epoch=False)
    result: list[dict[str, object]] = []
    for bar in rows:
        local = bar.timestamp.astimezone(IST)
        if local.date() != received.astimezone(IST).date():
            raise ValueError("intraday source contains another session")
        if bar.timestamp.second or bar.timestamp.microsecond:
            raise ValueError("nonaligned NSE minute")
        if not dt.time(9, 15) <= local.time() < dt.time(15, 30):
            continue  # CAS and pre-open bars never enter the regular-session strategy.
        if bar.timestamp + dt.timedelta(minutes=1) > received:
            continue
        result.append({"time": int(bar.timestamp.timestamp() * 1000),
                       "open": float(bar.open), "high": float(bar.high),
                       "low": float(bar.low), "close": float(bar.close),
                       "volume": bar.volume})
    return result


def pilot_market_snapshot(
    universe: dict[str, object], *, token: str, market: dict[str, object],
    getter: JsonGet = _get_json,
) -> dict[str, object]:
    watchlist = pilot_watchlist(universe)
    watchlist["NSE_INDEX|Nifty 50"] = "NIFTY 50"
    return market_snapshot(token=token, market=market, getter=getter, watchlist=watchlist)
