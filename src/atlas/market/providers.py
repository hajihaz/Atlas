"""Strict read-only market observations for stock/crypto research, never order execution.

This adapter has an explicit private-provider boundary. A public Atlas dashboard
must never proxy an owner's Upstox access token or licensed NSE quotes.
"""

from __future__ import annotations

import datetime as dt
import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from atlas.market.boundary import MarketDataBoundary, MarketDataStatus

_UPSTOX_QUOTE_URL = "https://api.upstox.com/v2/market-quote/quotes"
# Initial exchange-identified symbol verified in Upstox's official examples.
_NSE_INSTRUMENTS = {"RELIANCE": "NSE_EQ|INE002A01018"}
_KRAKEN_URL = "https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD"
_MAX_BYTES = 200_000


@dataclass(frozen=True)
class ObservedPrice:
    symbol: str
    market: str
    currency: str
    price: Decimal
    provider: str
    received_at: dt.datetime
    observed_at: dt.datetime | None
    paper_eligible: bool = False

    def __post_init__(self) -> None:
        if not self.symbol or not self.price.is_finite() or self.price <= 0:
            raise ValueError("invalid market price")
        if self.received_at.tzinfo is None:
            raise ValueError("received timestamp must be aware")
        if self.observed_at is not None and self.observed_at.tzinfo is None:
            raise ValueError("observed timestamp must be aware")


def _response_json(request: Request) -> Mapping[str, object]:
    """Bound response size; fixed endpoints prevent user-controlled SSRF."""
    with urlopen(request, timeout=5) as response:  # noqa: S310 - fixed provider allowlist
        raw = response.read(_MAX_BYTES + 1)
    if len(raw) > _MAX_BYTES:
        raise ValueError("market response exceeds bound")
    decoded: object = json.loads(raw)
    if not isinstance(decoded, dict):
        raise ValueError("invalid upstream market document")
    return decoded


def _positive_decimal(value: object) -> Decimal:
    if not isinstance(value, (str, int, float)) or isinstance(value, bool):
        raise ValueError("invalid provider price type")
    try:
        price = Decimal(str(value))
    except InvalidOperation as exc:
        raise ValueError("invalid provider price") from exc
    if not price.is_finite() or price <= 0:
        raise ValueError("invalid provider price")
    return price


def kraken_public_observation(
    symbol: str,
    *,
    received_at: dt.datetime,
    transport: Callable[[Request], Mapping[str, object]] = _response_json,
) -> ObservedPrice:
    """Real public crypto ticker; trade time not supplied, never paper eligible."""
    mapping = {"BTC/USD": "XXBTZUSD", "ETH/USD": "XETHZUSD"}
    if symbol not in mapping:
        raise ValueError("unsupported crypto observation symbol")
    request = Request(_KRAKEN_URL, headers={"Accept": "application/json"})
    document = transport(request)
    if document.get("error") != []:
        raise ValueError("crypto market provider error")
    result = document.get("result")
    if not isinstance(result, dict):
        raise ValueError("crypto market result missing")
    ticker = result.get(mapping[symbol])
    if not isinstance(ticker, dict):
        raise ValueError("crypto pair unavailable")
    last = ticker.get("c")
    if not isinstance(last, list) or not last:
        raise ValueError("crypto last price unavailable")
    return ObservedPrice(
        symbol=symbol, market="crypto", currency="USD",
        price=_positive_decimal(last[0]), provider="Kraken public ticker",
        received_at=received_at, observed_at=None, paper_eligible=False,
    )


def upstox_private_stock_observation(
    symbol: str,
    *,
    access_token: str,
    received_at: dt.datetime,
    transport: Callable[[Request], Mapping[str, object]] = _response_json,
) -> ObservedPrice:
    """Owner-private NSE quote. Token never leaves this transport boundary."""
    if symbol not in _NSE_INSTRUMENTS:
        raise ValueError("symbol not on audited NSE allowlist")
    if not isinstance(access_token, str) or not access_token.strip():
        raise PermissionError("authenticated market-data access required")
    instrument = _NSE_INSTRUMENTS[symbol]
    request = Request(  # noqa: S310 - fixed HTTPS origin and audited symbol allowlist
        _UPSTOX_QUOTE_URL + "?" + urlencode({"instrument_key": instrument}),
        headers={"Accept": "application/json", "Authorization": "Bearer " + access_token},
    )
    document = transport(request)
    if document.get("status") != "success":
        raise ValueError("market provider declined quote")
    data = document.get("data")
    if not isinstance(data, dict):
        raise ValueError("invalid private market data")
    matches = [item for item in data.values()
               if isinstance(item, dict) and item.get("instrument_token") == instrument]
    if len(matches) != 1:
        raise ValueError("market instrument mismatch or ambiguous result")
    quote = matches[0]
    millis = quote.get("last_trade_time")
    if not isinstance(millis, (str, int)) or isinstance(millis, bool):
        raise ValueError("last-trade timestamp missing")
    try:
        observed_at = dt.datetime.fromtimestamp(int(millis) / 1000, tz=dt.UTC)
    except (ValueError, OverflowError) as exc:
        raise ValueError("invalid last-trade timestamp") from exc
    price = _positive_decimal(quote.get("last_price"))
    # Missing, future and stale data fail closed at the pure market boundary.
    MarketDataBoundary().admit(
        MarketDataStatus(
            snapshot_id=f"upstox:{symbol}:{millis}", as_of=received_at,
            latest_observation=observed_at, max_age=dt.timedelta(seconds=120),
        )
    )
    return ObservedPrice(
        symbol=symbol, market="NSE", currency="INR", price=price,
        provider="Upstox private quote", received_at=received_at,
        observed_at=observed_at,
        # A single quote alone is not sufficient for executable paper fills.
        paper_eligible=False,
    )
