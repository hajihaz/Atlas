"""Stock and crypto provider mocks — no credentials, egress, or trades."""

import datetime as dt
from urllib.parse import unquote

import pytest

from atlas.market.providers import (
    kraken_public_observation,
    upstox_private_stock_observation,
)

NOW = dt.datetime(2026, 10, 18, 7, 31, tzinfo=dt.UTC)
TOKEN = "test-only-never-real"


def test_public_crypto_price_is_not_fabricated_as_executable_feed() -> None:
    called = []

    def receive(request):
        called.append((request.full_url, request.get_header("Authorization")))
        return {
            "error": [],
            "result": {
                "XXBTZUSD": {"c": ["65001.23"]},
                "XETHZUSD": {"c": ["3205.02"]},
            },
        }

    quote = kraken_public_observation("BTC/USD", received_at=NOW, transport=receive)
    assert str(quote.price) == "65001.23"
    assert quote.observed_at is None
    assert quote.paper_eligible is False
    assert called == [
        ("https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD", None)
    ]


@pytest.mark.parametrize("bad", ["NaN", "Infinity", "-1", "0", "not-a-number"])
def test_crypto_provider_invalid_price_fails_closed(bad: str) -> None:
    def receive(_request):
        return {"error": [], "result": {"XXBTZUSD": {"c": [bad]}}}

    with pytest.raises(ValueError):
        kraken_public_observation("BTC/USD", received_at=NOW, transport=receive)


def test_private_stock_quote_uses_official_instrument_and_stays_read_only() -> None:
    observations = []

    def receive(request):
        observations.append(request)
        return {
            "status": "success",
            "data": {
                "NSE_EQ:RELIANCE": {
                    "instrument_token": "NSE_EQ|INE002A01018",
                    "last_price": 1200.50,
                    "last_trade_time": str(int(NOW.timestamp() * 1000)),
                }
            },
        }

    quote = upstox_private_stock_observation(
        "RELIANCE", access_token=TOKEN, received_at=NOW, transport=receive
    )
    assert str(quote.price) == "1200.5"
    assert quote.currency == "INR"
    assert quote.observed_at == NOW
    assert quote.paper_eligible is False
    request = observations[0]
    assert request.full_url.startswith("https://api.upstox.com/v2/market-quote/quotes?")
    assert "NSE_EQ|INE002A01018" in unquote(request.full_url)
    assert request.get_header("Authorization") == "Bearer " + TOKEN
    assert TOKEN not in request.full_url


def test_private_stock_quote_rejects_missing_authority_and_arbitrary_instruments() -> None:
    with pytest.raises(PermissionError):
        upstox_private_stock_observation(
            "RELIANCE", access_token="", received_at=NOW, transport=lambda _r: {}
        )
    with pytest.raises(ValueError, match="allowlist"):
        upstox_private_stock_observation(
            "FAKE-NSE-SYMBOL", access_token=TOKEN, received_at=NOW,
            transport=lambda _r: {},
        )


@pytest.mark.parametrize("offset_seconds", [-180, 30])
def test_stock_quote_stale_or_future_disallowed(offset_seconds: int) -> None:
    def receive(_request):
        observed = NOW + dt.timedelta(seconds=offset_seconds)
        return {"status": "success", "data": {
            "NSE_EQ:RELIANCE": {
                "instrument_token": "NSE_EQ|INE002A01018",
                "last_price": "2450.50",
                "last_trade_time": str(int(observed.timestamp() * 1000)),
            }
        }}

    with pytest.raises(ValueError, match="stale or from the future"):
        upstox_private_stock_observation(
            "RELIANCE", access_token=TOKEN, received_at=NOW, transport=receive
        )


def test_stock_quote_wrong_instrument_not_accepted() -> None:
    def receive(_request):
        return {"status": "success", "data": {
            "NSE_EQ:RELIANCE": {
                "instrument_token": "NSE_EQ|FORGED",
                "last_price": "9999",
                "last_trade_time": str(int(NOW.timestamp() * 1000)),
            }
        }}

    with pytest.raises(ValueError, match="instrument mismatch"):
        upstox_private_stock_observation(
            "RELIANCE", access_token=TOKEN, received_at=NOW, transport=receive
        )
