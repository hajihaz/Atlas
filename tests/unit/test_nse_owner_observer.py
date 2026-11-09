"""Provider, authority, crash-safety and owner-gate contracts; synthetic inputs only."""

import datetime as dt
import json
from io import BytesIO
from unittest.mock import patch
from urllib.error import HTTPError

import pytest

from atlas.integrations.nse_observer import acquire_lock, failure_state, save_snapshot
from atlas.integrations.nse_snapshot import WATCHLIST, exchange_status, market_snapshot
from atlas.market.read_only_transport import ReadOnlyServiceError, market_data_get

NOW = dt.datetime(2026, 10, 26, 12, tzinfo=dt.UTC)
CLOSED = {"exchange": "NSE", "status": "CLOSING_END", "marketOpen": False}


def response():
    return {"status": "success", "data": {
        str(i): {"instrument_token": key, "last_price": 100 + i, "volume": None,
                 "last_trade_time": "2026-10-26T15:29:00+05:30",
                 "timestamp": "2026-10-26T12:00:00Z"}
        for i, key in enumerate(WATCHLIST)
    }}


def snapshot(payload=None, market=None):
    return market_snapshot(token="synthetic-only", received_at=NOW,
                           market=market or CLOSED, getter=lambda _u, _h: payload or response())


def test_closed_snapshot_preserves_source_time_and_units_without_execution_authority():
    result = snapshot()
    assert result["observedAt"] == NOW.isoformat()
    assert result["market"] == CLOSED
    assert result["quotes"][0]["lastTradeAt"] == "2026-10-26T09:59:00+00:00"
    assert result["quotes"][0]["priceUnit"] == "POINTS"
    assert result["quotes"][1]["priceUnit"] == "INR"
    assert result["realOrdersEnabled"] is result["paperOrdersEnabled"] is False
    assert result["executionFreshnessCertified"] is False
    assert result["actualCapitalINR"] == 0
    assert len(result["sourcePayloadSHA256"]) == 64


def test_missing_exchange_time_is_not_replaced_with_local_receive_time():
    payload = response()
    for row in payload["data"].values():
        row.pop("last_trade_time")
        row.pop("timestamp")
    assert all(row["lastTradeAt"] is None and row["quoteTimestamp"] is None
               for row in snapshot(payload)["quotes"])


@pytest.mark.parametrize("change", [
    {"instrument_token": "NSE_EQ|WRONG"},
    {"instrument_token": ["unhashable"]},
    {"last_price": True}, {"last_price": "NaN"}, {"last_price": -1},
    {"volume": -1}, {"volume": True},
    {"timestamp": "2026-10-26T12:00:06Z"},
    {"last_trade_time": "2026-10-26T12:00:00"},
    {"last_trade_time": True},
])
def test_malformed_provider_row_is_rejected(change):
    payload = response()
    payload["data"]["0"].update(change)
    with pytest.raises(ValueError):
        snapshot(payload)


def test_identity_completeness_duplicates_and_market_cache_are_checked():
    for modify in ("missing", "duplicate"):
        payload = response()
        if modify == "missing":
            payload["data"].pop("1")
        else:
            payload["data"]["1"]["instrument_token"] = payload["data"]["0"]["instrument_token"]
        with pytest.raises(ValueError):
            snapshot(payload)
    with pytest.raises(ValueError):
        snapshot(market={**CLOSED, "marketOpen": True})
    result = snapshot(market={**CLOSED, "secret": "must-not-project"})
    assert "secret" not in result["market"]


def test_exchange_status_uses_exact_read_only_endpoint_and_projected_fields():
    calls = []

    def get(url, headers):
        calls.append((url, headers))
        return {"status": "success", "data": {
            "exchange": "NSE", "status": "NORMAL_OPEN", "secret": "must-not-project"}}
    assert exchange_status(token="synthetic-only", getter=get) == {
        "exchange": "NSE", "status": "NORMAL_OPEN", "marketOpen": True}
    assert calls[0][0] == "https://api.upstox.com/v2/market/status/NSE"
    assert calls[0][1]["Authorization"] == "Bearer synthetic-only"


@pytest.mark.parametrize("status,code,retry,owner", [
    (401, "UDAPI100050", 0, True), (403, "1010", 0, True),
    (429, "UDAPI10005", 60, False), (503, None, 0, False),
])
def test_http_diagnostics_reveal_only_allowlisted_codes(status, code, retry, owner):
    body = {"errors": [{"errorCode": code, "message": "synthetic-secret-do-not-reflect"}]}
    error = HTTPError("https://private.invalid/synthetic-secret", status, "synthetic-secret",
                      {"Retry-After": str(retry)}, BytesIO(json.dumps(body).encode()))
    with patch("atlas.market.read_only_transport.build_opener") as opener:
        opener.return_value.open.side_effect = error
        with pytest.raises(ReadOnlyServiceError) as caught:
            market_data_get("https://api.upstox.com/v2/market/status/NSE", {})
    result = caught.value
    assert "synthetic-secret" not in str(result)
    assert result.provider_code == code
    assert result.owner_action_required is owner
    state, delay, stop = failure_state(result, 2)
    assert state["httpStatus"] == status and stop is owner
    assert delay >= retry
    assert not state["quotes"]


@pytest.mark.parametrize("url", [
    "https://api.upstox.com/v2/order/place",
    "https://api.upstox.com/v2/market/status/BSE",
    "https://api.upstox.com/v2/market/status/NSE?token=synthetic",
    "https://api.upstox.com/v3/market-quote/quotes?instrument_key=X&token=synthetic",
    "https://api.upstox.com.evil.invalid/v2/market/status/NSE",
])
def test_quote_extension_does_not_grant_other_endpoint_authority(url):
    with patch("atlas.market.read_only_transport._read") as read:
        with pytest.raises(ValueError):
            market_data_get(url, {})
        read.assert_not_called()


def test_atomic_snapshot_preserves_previous_good_state_on_serialization_failure(tmp_path):
    folder = tmp_path / "private"
    folder.mkdir(mode=0o700)
    dest = folder / "nse-market.json"
    save_snapshot(dest, {"revision": 1})
    assert dest.stat().st_mode & 0o777 == 0o600
    with pytest.raises(ValueError):
        save_snapshot(dest, {"invalid": float("nan")})
    assert json.loads(dest.read_text()) == {"revision": 1}
    assert list(folder.iterdir()) == [dest]


def test_state_and_lock_refuse_symlinks_permissions_and_duplicate_workers(tmp_path):
    folder = tmp_path / "private"
    folder.mkdir(mode=0o700)
    outside = tmp_path / "outside.json"
    outside.write_text("preserve")
    dest = folder / "nse-market.json"
    dest.symlink_to(outside)
    with pytest.raises(ValueError):
        save_snapshot(dest, {"new": 1})
    assert outside.read_text() == "preserve"
    dest.unlink()
    with acquire_lock(dest):
        with pytest.raises(BlockingIOError):
            acquire_lock(dest)
    folder.chmod(0o755)
    with pytest.raises(ValueError):
        save_snapshot(dest, {})


def test_rate_limit_retry_after_is_honored_even_when_provider_returns_html():
    error = HTTPError("https://private.invalid/", 429, "limited",
                      {"Retry-After": "120"}, BytesIO(b"<html>limited</html>"))
    with patch("atlas.market.read_only_transport.build_opener") as opener:
        opener.return_value.open.side_effect = error
        with pytest.raises(ReadOnlyServiceError) as caught:
            market_data_get("https://api.upstox.com/v2/market/status/NSE", {})
    state, delay, stop = failure_state(caught.value, 1)
    assert delay == 120 and stop is False
    assert state["providerCode"] is None
