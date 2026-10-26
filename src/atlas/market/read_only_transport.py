"""Pinned network authority for historical market data and local sandbox status.

This is Atlas's ONLY additional HTTP authority. No order submissions are
exposed. Redirects are refused to protect bearer credentials from forwarding.
"""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(
        self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str
    ) -> None:
        raise RuntimeError("market-data redirect refused")


def _read(request: Request) -> object:
    try:
        with build_opener(NoRedirect()).open(request, timeout=15) as response:
            raw = response.read(8_000_001)
    except Exception:
        # Do not expose request URL, credentials or raw provider error bodies.
        raise RuntimeError("approved read-only data service unavailable") from None
    if len(raw) > 8_000_000:
        raise ValueError("oversized read-only response")
    try:
        return json.loads(raw)
    except (ValueError, UnicodeError):
        raise ValueError("invalid read-only response JSON") from None


def market_data_get(url: str, headers: dict[str, str]) -> object:
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.port not in (None, 443) or parts.fragment:
        raise ValueError("only pinned HTTPS market data URLs permitted")
    upstox_history = (
        parts.hostname == "api.upstox.com"
        and parts.path.startswith("/v3/historical-candle/")
        and parts.query == ""
    )
    upstox_quote = (
        parts.hostname == "api.upstox.com"
        and parts.path == "/v3/market-quote/ltp"
        and parts.query.startswith("instrument_key=")
        and "&" not in parts.query
    )
    fyers_history = (
        parts.hostname == "api-t1.fyers.in" and parts.path == "/data/history" and bool(parts.query)
    )
    approved = upstox_history or upstox_quote or fyers_history
    if not approved or parts.username is not None or parts.password is not None:
        raise ValueError("unapproved read-only market-data endpoint")
    return _read(Request(url, headers=headers, method="GET"))  # noqa: S310


def local_openalgo_analyzer_post(target: str, body: dict[str, str]) -> object:
    parts = urlsplit(target)
    if (
        parts.scheme != "http"
        or parts.hostname != "127.0.0.1"
        or parts.port is None
        or parts.path != "/api/v1/analyzer"
        or parts.query
        or parts.fragment
        or parts.username is not None
        or parts.password is not None
        or set(body) != {"apikey"}
        or not body["apikey"]
    ):
        raise ValueError("only exact local OpenAlgo analyzer status permitted")
    # This is a status read via documented POST (no 'mode' and no order routes).
    return _read(
        Request(  # noqa: S310 - exact loopback analyzer status only
            target,
            json.dumps(body).encode("utf-8"),
            {"Content-Type": "application/json"},
            method="POST",
        )
    )
