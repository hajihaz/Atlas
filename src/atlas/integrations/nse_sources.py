"""Strict read-only Upstox V3 and FYERS V3 NSE historical candles.

Never calls trading APIs. Secrets stay in process memory; errors deliberately omit
request headers. External responses are not admitted as certified NSE universes.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from urllib.parse import quote, urlencode
from zoneinfo import ZoneInfo

from atlas.market.read_only_transport import market_data_get

IST = ZoneInfo("Asia/Kolkata")
UPSTOX_HOST = "https://api.upstox.com"
FYERS_HOST = "https://api-t1.fyers.in"
_UPSTOX_KEY = re.compile(r"^NSE_(?:EQ|INDEX)\|[A-Za-z0-9 _.-]{2,64}$")
_FYERS_KEY = re.compile(r"^NSE:[A-Z0-9&_.-]{1,48}-(?:EQ|INDEX)$")


@dataclass(frozen=True)
class Candle:
    timestamp: dt.datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int

    def __post_init__(self) -> None:
        if self.timestamp.tzinfo is None or self.timestamp.utcoffset() is None:
            raise ValueError("candle must have timezone")
        prices = (self.open, self.high, self.low, self.close)
        if any(not x.is_finite() or x <= 0 for x in prices):
            raise ValueError("nonpositive or nonfinite OHLC")
        if self.high < max(prices) or self.low > min(prices) or self.volume < 0:
            raise ValueError("inconsistent candle OHLCV")


@dataclass(frozen=True)
class HistoricalBatch:
    provider: str
    instrument: str
    interval: str
    from_date: dt.date
    to_date: dt.date
    candles: tuple[Candle, ...]
    payload_sha256: str
    status: str = "UNCERTIFIED_INSTRUMENT_HISTORY"

    def __post_init__(self) -> None:
        if not self.candles:
            raise ValueError("empty historical provider response")
        previous: dt.datetime | None = None
        for bar in self.candles:
            instant = bar.timestamp.astimezone(dt.UTC)
            if previous is not None and instant <= previous:
                raise ValueError("out-of-order or duplicate historical timestamp")
            previous = instant
            if not self.from_date <= instant.astimezone(IST).date() <= self.to_date:
                raise ValueError("candle outside requested NSE local dates")


# Injected JSON transport allows contract tests without broker credentials or network.
JsonGet = Callable[[str, dict[str, str]], object]


def _get_json(url: str, headers: dict[str, str]) -> object:
    return market_data_get(url, headers)


def _price(value: object) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (int, str, float)):
        raise ValueError("invalid OHLC type")
    try:
        return Decimal(str(value))
    except InvalidOperation:
        raise ValueError("invalid OHLC number") from None


def _parse_bars(rows: object, *, epoch: bool) -> tuple[Candle, ...]:
    if not isinstance(rows, list) or len(rows) > 100_000:
        raise ValueError("unexpected historical candle collection")
    found = []
    for row in rows:
        if not isinstance(row, list) or len(row) < 6:
            raise ValueError("incomplete candle")
        timestamp = row[0]
        if epoch:
            if isinstance(timestamp, bool) or not isinstance(timestamp, int):
                raise ValueError("invalid epoch timestamp")
            when = dt.datetime.fromtimestamp(timestamp, tz=dt.UTC)
        else:
            if not isinstance(timestamp, str):
                raise ValueError("invalid timestamp")
            when = dt.datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            if when.tzinfo is None:
                raise ValueError("provider omitted timezone")
        volume = row[5]
        if isinstance(volume, bool) or not isinstance(volume, int):
            raise ValueError("invalid volume")
        values = [_price(x) for x in row[1:5]]
        found.append(
            Candle(when.astimezone(dt.UTC), values[0], values[1], values[2], values[3], volume)
        )
    found.sort(key=lambda x: x.timestamp)
    return tuple(found)


def _batch(
    provider: str,
    instrument: str,
    interval: str,
    start: dt.date,
    end: dt.date,
    rows: object,
    *,
    epoch: bool,
) -> HistoricalBatch:
    # Bind source evidence to exact supplied payload before chronological normalization.
    digest = hashlib.sha256(
        json.dumps(rows, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    ).hexdigest()
    return HistoricalBatch(
        provider,
        instrument,
        interval,
        start,
        end,
        _parse_bars(rows, epoch=epoch),
        digest,
    )


def upstox_history(
    instrument_key: str,
    start: dt.date,
    end: dt.date,
    *,
    token: str,
    interval: int = 1,
    getter: JsonGet = _get_json,
) -> HistoricalBatch:
    if not _UPSTOX_KEY.fullmatch(instrument_key):
        raise ValueError("invalid Upstox NSE instrument key")
    if not 1 <= interval <= 15 or start > end or (end - start).days > 27:
        raise ValueError("Upstox minute history limited to a 28-day chunk")
    if not token:
        raise RuntimeError("Upstox read-only Analytics Token unavailable")
    key = quote(instrument_key, safe="")
    url = (
        f"{UPSTOX_HOST}/v3/historical-candle/{key}/minutes/{interval}/"
        f"{end.isoformat()}/{start.isoformat()}"
    )
    response = getter(url, {"Accept": "application/json", "Authorization": f"Bearer {token}"})
    if not isinstance(response, dict) or response.get("status") != "success":
        raise RuntimeError("Upstox history request unsuccessful")
    data = response.get("data")
    if not isinstance(data, dict):
        raise ValueError("Upstox response without data")
    return _batch(
        "upstox_v3", instrument_key, f"{interval}m", start, end, data.get("candles"), epoch=False
    )


def fyers_history(
    instrument: str,
    start: dt.date,
    end: dt.date,
    *,
    app_id: str,
    token: str,
    interval: int = 1,
    getter: JsonGet = _get_json,
) -> HistoricalBatch:
    if not _FYERS_KEY.fullmatch(instrument):
        raise ValueError("invalid FYERS NSE symbol")
    if not 1 <= interval <= 60 or start > end or (end - start).days > 99:
        raise ValueError("FYERS minute history limited to 100-day chunks")
    if not app_id or not token:
        raise RuntimeError("FYERS market-data credentials unavailable")
    query = urlencode(
        {
            "symbol": instrument,
            "resolution": str(interval),
            "date_format": "1",
            "range_from": start.isoformat(),
            "range_to": end.isoformat(),
            "cont_flag": "0",
        }
    )
    response = getter(
        f"{FYERS_HOST}/data/history?{query}",
        {"Accept": "application/json", "Authorization": f"{app_id}:{token}"},
    )
    if not isinstance(response, dict) or response.get("s") != "ok":
        raise RuntimeError("FYERS history request unsuccessful")
    return _batch(
        "fyers_v3", instrument, f"{interval}m", start, end, response.get("candles"), epoch=True
    )
