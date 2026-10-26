"""Read-only clients identify Atlas transparently rather than claiming to be a browser."""

from unittest.mock import patch

from atlas.market.read_only_transport import MARKET_CLIENT_USER_AGENT, market_data_get


def test_pinned_market_request_identifies_the_actual_application_without_changing_authority():
    with patch(
        "atlas.market.read_only_transport._read", return_value={"status": "success"}
    ) as read:
        market_data_get(
            "https://api.upstox.com/v3/market-quote/ltp?instrument_key=NSE_INDEX%7CNifty%2050",
            {"Accept": "application/json", "Authorization": "Bearer synthetic-test-only"},
        )
    request = read.call_args.args[0]
    assert request.get_header("User-agent") == MARKET_CLIENT_USER_AGENT
    assert request.get_method() == "GET"
    assert request.get_header("Authorization") == "Bearer synthetic-test-only"
    assert "synthetic-test-only" not in request.full_url
    assert "Mozilla" not in MARKET_CLIENT_USER_AGENT
    assert "Chrome" not in MARKET_CLIENT_USER_AGENT
