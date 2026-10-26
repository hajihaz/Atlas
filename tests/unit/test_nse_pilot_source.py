"""NSE identity and completed-candle boundaries; no account or network required."""

import datetime as dt
import gzip
import json

import pytest

from atlas.integrations.nse_pilot_source import (
    SYMBOLS,
    intraday_bars,
    pilot_watchlist,
    universe_from_payload,
)
from atlas.integrations.nse_snapshot import market_snapshot

NOW = dt.datetime(2026, 10, 26, 4, 31, 5, tzinfo=dt.UTC)


def master():
    return [{"trading_symbol": symbol, "segment": "NSE_EQ", "instrument_type": "EQ",
             "exchange": "NSE", "lot_size": 1, "security_type": "NORMAL",
             "instrument_key": "NSE_EQ|INE" + str(index + 1).zfill(9)}
            for index, symbol in enumerate(SYMBOLS)]


def admit(rows):
    return universe_from_payload(gzip.compress(json.dumps(rows).encode()), observed_at=NOW)


def test_full_fixed_basket_requires_exact_source_identities_and_never_certifies_old_universe():
    universe = admit(master())
    assert len(pilot_watchlist(universe)) == 10
    assert universe["historicalPointInTimeUniverse"] is False
    assert universe["classification"] == "FIXED_TEN_STOCK_PILOT_NOT_MARKET_WIDE_TOP_TEN"
    assert len(universe["payloadSHA256"]) == 64


@pytest.mark.parametrize("change", ["missing", "duplicate", "wrong-lot", "suspended", "wrong-key"])
def test_missing_ambiguous_or_ineligible_instrument_is_not_silently_substituted(change):
    rows = master()
    if change == "missing":
        rows.pop()
    elif change == "duplicate":
        rows.append(rows[0])
    elif change == "wrong-lot":
        rows[0]["lot_size"] = 100
    elif change == "suspended":
        rows[0]["security_type"] = "SUSPENDED"
    else:
        rows[0]["instrument_key"] = "NSE_FO|111"
    with pytest.raises(ValueError):
        admit(rows)


def test_intraday_filters_partial_and_auction_bars_and_preserves_causal_ohlcv():
    calls = []
    bars = [
        ["2026-10-26T09:15:00+05:30", 100, 102, 99, 101, 1000],
        ["2026-10-26T10:00:00+05:30", 101, 102, 100, 101, 1200],
        ["2026-10-26T10:01:00+05:30", 101, 103, 100, 102, 300],
        ["2026-10-26T09:00:00+05:30", 100, 100, 100, 100, 1],
    ]
    def get(url, headers):
        calls.append((url, headers))
        return {"status": "success", "data": {"candles": bars}}
    parsed = intraday_bars("NSE_EQ|INE000000001", token="synthetic", received_at=NOW, getter=get)
    assert len(parsed) == 2
    assert parsed[0]["close"] == 101
    assert calls[0][0].startswith("https://api.upstox.com/v3/historical-candle/intraday/")
    assert calls[0][1]["Authorization"] == "Bearer synthetic"
    assert "synthetic" not in calls[0][0]


def test_intraday_rejects_previous_session_instead_of_seeding_forward_trades():
    def get(_url, _headers):
        return {"status": "success", "data": {"candles": [
            ["2026-10-23T09:15:00+05:30", 100, 100, 100, 100, 10]]}}
    with pytest.raises(ValueError, match="another session"):
        intraday_bars("NSE_EQ|INE000000001", token="synthetic", received_at=NOW, getter=get)


def test_bounded_quote_watchlist_keeps_actual_book_separate_from_missing_liquidity():
    def get(_url, _headers):
        return {"status": "success", "data": {"row": {
            "instrument_token": "NSE_EQ|INE000000001", "last_price": 100,
            "volume": 100, "timestamp": NOW.isoformat(), "last_trade_time": NOW.isoformat(),
            "depth": {"buy": [{"price": 99.95, "quantity": 100}],
                      "sell": [{"price": 0, "quantity": 0}]},
        }}}
    result = market_snapshot(token="synthetic", received_at=NOW,
        market={"exchange": "NSE", "status": "NORMAL_OPEN", "marketOpen": True},
        watchlist={"NSE_EQ|INE000000001": "RELIANCE"}, getter=get)
    assert result["quotes"][0]["depth"]["buy"] == {"price": 99.95, "quantity": 100}
    assert result["quotes"][0]["depth"]["sell"] == {"price": None, "quantity": 0}
    assert result["paperOrdersEnabled"] is False


def test_public_master_transport_is_pinned_and_never_accepts_or_sends_bearer_credentials():
    from unittest.mock import patch

    from atlas.market.read_only_transport import (
        MARKET_CLIENT_USER_AGENT,
        NSE_INSTRUMENT_MASTER_URL,
        nse_instrument_master_get,
    )
    with patch("atlas.market.read_only_transport.build_opener") as opener:
        opener.return_value.open.return_value.__enter__.return_value.read.return_value = b"public"
        assert nse_instrument_master_get() == b"public"
        request = opener.return_value.open.call_args.args[0]
        assert request.full_url == NSE_INSTRUMENT_MASTER_URL
        assert request.get_method() == "GET"
        assert request.get_header("Authorization") is None
        assert request.get_header("User-agent") == MARKET_CLIENT_USER_AGENT
