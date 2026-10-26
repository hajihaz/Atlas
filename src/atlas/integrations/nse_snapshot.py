"""Owner-only NSE quote observations. No broker or paper-order authority."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
from decimal import Decimal, InvalidOperation
from urllib.parse import quote

from atlas.integrations.nse_sources import JsonGet, _get_json

WATCHLIST = {
    "NSE_INDEX|Nifty 50": "NIFTY 50",
    "NSE_EQ|INE002A01018": "RELIANCE",
}


def _timestamp(value: object, received_at: dt.datetime) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise ValueError("invalid provider timestamp")
    if isinstance(value, (int, str)) and re.fullmatch(r"[0-9]{13}", str(value)):
        instant = dt.datetime.fromtimestamp(int(value) / 1000, tz=dt.UTC)
    elif isinstance(value, str):
        instant = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if instant.tzinfo is None or instant.utcoffset() is None:
            raise ValueError("provider timestamp requires timezone")
    else:
        raise ValueError("invalid provider timestamp")
    if instant > received_at + dt.timedelta(seconds=5):
        raise ValueError("provider timestamp is in the future")
    return instant.astimezone(dt.UTC).isoformat()


def exchange_status(*, token: str, getter: JsonGet = _get_json) -> dict[str, object]:
    if not token:
        raise RuntimeError("Analytics credential unavailable")
    obj = getter(
        "https://api.upstox.com/v2/market/status/NSE",
        {"Accept": "application/json", "Authorization": f"Bearer {token}"},
    )
    if not isinstance(obj, dict) or obj.get("status") != "success":
        raise ValueError("NSE exchange status unavailable")
    data = obj.get("data")
    if not isinstance(data, dict) or data.get("exchange") != "NSE":
        raise ValueError("NSE exchange identity mismatch")
    status = data.get("status")
    if not isinstance(status, str) or not re.fullmatch(r"[A-Z_]{2,40}", status):
        raise ValueError("invalid NSE market state")
    return {"exchange": "NSE", "status": status, "marketOpen": status == "NORMAL_OPEN"}


def market_snapshot(
    *,
    token: str,
    market: dict[str, object] | None = None,
    received_at: dt.datetime | None = None,
    getter: JsonGet = _get_json,
) -> dict[str, object]:
    if not token:
        raise RuntimeError("Analytics credential unavailable")
    market = exchange_status(token=token, getter=getter) if market is None else market
    if (
        market.get("exchange") != "NSE"
        or not isinstance(market.get("status"), str)
        or re.fullmatch(r"[A-Z_]{2,40}", str(market["status"])) is None
        or type(market.get("marketOpen")) is not bool
        or market.get("marketOpen") != (market["status"] == "NORMAL_OPEN")
    ):
        raise ValueError("untrusted market-state cache")
    keys = quote(",".join(WATCHLIST), safe="")
    response = getter(
        "https://api.upstox.com/v3/market-quote/quotes?instrument_key=" + keys,
        {"Accept": "application/json", "Authorization": f"Bearer {token}"},
    )
    received = received_at or dt.datetime.now(dt.UTC)
    if received.tzinfo is None or received.utcoffset() is None:
        raise ValueError("receive timestamp must be timezone-aware")
    if not isinstance(response, dict) or response.get("status") != "success":
        raise ValueError("NSE market quotes unavailable")
    data = response.get("data")
    if not isinstance(data, dict) or len(data) != len(WATCHLIST):
        raise ValueError("incomplete NSE watchlist response")
    found = {}
    for raw in data.values():
        if not isinstance(raw, dict):
            raise ValueError("invalid NSE quote row")
        key = raw.get("instrument_token")
        if not isinstance(key, str) or key not in WATCHLIST or key in found:
            raise ValueError("NSE instrument identity mismatch")
        price_raw = raw.get("last_price")
        if isinstance(price_raw, bool):
            raise ValueError("invalid NSE price")
        try:
            price = Decimal(str(price_raw))
        except InvalidOperation:
            raise ValueError("invalid NSE price") from None
        if not price.is_finite() or not Decimal("0") < price <= Decimal("1e12"):
            raise ValueError("invalid NSE price")
        volume = raw.get("volume")
        if volume is not None and (type(volume) is not int or volume < 0):
            raise ValueError("invalid NSE share volume")
        traded = _timestamp(raw.get("last_trade_time"), received)
        source_time = _timestamp(raw.get("timestamp"), received)
        found[key] = {
            "instrumentKey": key,
            "symbol": WATCHLIST[key],
            "lastPrice": float(price),
            "priceUnit": "POINTS" if key.startswith("NSE_INDEX|") else "INR",
            "volume": volume,
            "lastTradeAt": traded,
            "quoteTimestamp": source_time,
        }
    return {
        "schema": 1,
        "mode": "OWNER_NSE_OBSERVATION",
        "status": "OK",
        "source": "Upstox Analytics",
        "observedAt": received.astimezone(dt.UTC).isoformat(),
        "market": {name: market[name] for name in ("exchange", "status", "marketOpen")},
        "quotes": [found[key] for key in WATCHLIST],
        "sourcePayloadSHA256": hashlib.sha256(
            json.dumps(response, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest(),
        "audience": "OWNER_ONLY",
        "realOrdersEnabled": False,
        "paperOrdersEnabled": False,
        "actualCapitalINR": 0,
        "executionFreshnessCertified": False,
    }
