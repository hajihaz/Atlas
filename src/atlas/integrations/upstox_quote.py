"""Read-only NSE Upstox LTP snapshot. Never trust as execution-fresh.

Upstox V3 LTP response carries no exchange timestamp, and a local received-at
timestamp is NOT a substitute for last traded time. It must not drive trades.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from urllib.parse import quote

from atlas.integrations.nse_sources import _UPSTOX_KEY, UPSTOX_HOST, JsonGet, _get_json


@dataclass(frozen=True)
class QuoteObservation:
    instrument_key: str
    received_at: dt.datetime
    last_price: Decimal
    volume: int
    market_timestamp: None = None
    execution_freshness_verified: bool = False
    source: str = "upstox_v3_ltp_observation"


def upstox_ltp(
    instrument_key: str, *, token: str, received_at: dt.datetime, getter: JsonGet = _get_json
) -> QuoteObservation:
    if not _UPSTOX_KEY.fullmatch(instrument_key):
        raise ValueError("invalid Upstox NSE instrument key")
    if not token:
        raise RuntimeError("Upstox read-only Analytics Token unavailable")
    if received_at.tzinfo is None or received_at.utcoffset() is None:
        raise ValueError("receive time requires timezone")
    url = f"{UPSTOX_HOST}/v3/market-quote/ltp?instrument_key={quote(instrument_key, safe='')}"
    obj = getter(url, {"Accept": "application/json", "Authorization": f"Bearer {token}"})
    if not isinstance(obj, dict) or obj.get("status") != "success":
        raise RuntimeError("Upstox LTP provider unavailable")
    data = obj.get("data")
    if not isinstance(data, dict) or len(data) != 1:
        raise ValueError("unexpected Upstox LTP quote collection")
    row = next(iter(data.values()))
    if not isinstance(row, dict) or row.get("instrument_token") != instrument_key:
        raise ValueError("Upstox instrument-token mismatch")
    try:
        price = Decimal(str(row["last_price"]))
    except (ValueError, InvalidOperation, KeyError, TypeError):
        raise ValueError("invalid quote price") from None
    volume = row.get("volume")
    if not price.is_finite() or price <= 0 or type(volume) is not int or volume < 0:
        raise ValueError("invalid LTP/volume")
    return QuoteObservation(instrument_key, received_at, price, volume)
