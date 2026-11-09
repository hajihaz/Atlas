"""Pinned network authority for historical market data and local sandbox status.

This is Atlas's ONLY additional HTTP authority. No order submissions are
exposed. Redirects are refused to protect bearer credentials from forwarding.
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

MARKET_CLIENT_USER_AGENT = "AtlasReadOnlyResearch/0.2"
NSE_INSTRUMENT_MASTER_URL = (
    "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(
        self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str
    ) -> None:
        raise RuntimeError("market-data redirect refused")


class ReadOnlyServiceError(RuntimeError):
    """Safe provider diagnostics without reflecting URLs, headers or error-body text."""

    def __init__(self, status: int, code: str | None = None, retry_after: int = 0) -> None:
        self.http_status = status
        self.provider_code = code
        self.retry_after_seconds = retry_after
        self.retryable = status == 429 or 500 <= status <= 599
        self.owner_action_required = status in (401, 403)
        label = f"approved read-only service returned HTTP {status}"
        if code is not None:
            label += f" ({code})"
        super().__init__(label)


def _read(request: Request) -> object:
    try:
        with build_opener(NoRedirect()).open(request, timeout=15) as response:
            raw = response.read(8_000_001)
    except HTTPError as error:
        code = None
        retry_after = 0
        raw_retry = error.headers.get("Retry-After", "") if error.headers else ""
        if raw_retry.isdigit():
            retry_after = min(3600, int(raw_retry))
        try:
            body = json.loads(error.read(32_769))
            candidates = [body.get("error_code")] if isinstance(body, dict) else []
            if isinstance(body, dict) and isinstance(body.get("errors"), list):
                candidates.extend(
                    row.get("errorCode") or row.get("error_code")
                    for row in body["errors"][:5]
                    if isinstance(row, dict)
                )
            for candidate in candidates:
                value = str(candidate)
                if re.fullmatch(r"UDAPI[0-9]{4,8}|1010|1015|1020", value):
                    code = value
                    break
        except (ValueError, TypeError, OSError, AttributeError):
            pass
        raise ReadOnlyServiceError(error.code, code, retry_after) from None
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
        and parts.path in {"/v3/market-quote/ltp", "/v3/market-quote/quotes"}
        and parts.query.startswith("instrument_key=")
        and "&" not in parts.query
    )
    fyers_history = (
        parts.hostname == "api-t1.fyers.in" and parts.path == "/data/history" and bool(parts.query)
    )
    upstox_status = (
        parts.hostname == "api.upstox.com"
        and parts.path == "/v2/market/status/NSE"
        and parts.query == ""
    )
    approved = upstox_history or upstox_quote or upstox_status or fyers_history
    if not approved or parts.username is not None or parts.password is not None:
        raise ValueError("unapproved read-only market-data endpoint")
    identified_headers = {**headers, "User-Agent": MARKET_CLIENT_USER_AGENT}
    return _read(Request(url, headers=identified_headers, method="GET"))  # noqa: S310


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


def nse_instrument_master_get() -> bytes:
    """Exact public metadata GET, with no credential argument or redirect authority."""
    request = Request(
        NSE_INSTRUMENT_MASTER_URL,
        headers={"User-Agent": MARKET_CLIENT_USER_AGENT},
        method="GET",
    )
    try:
        with build_opener(NoRedirect()).open(request, timeout=20) as response:
            raw = response.read(8_000_001)
    except Exception:
        raise RuntimeError("pinned Upstox instrument master unavailable") from None
    if not isinstance(raw, bytes) or len(raw) > 8_000_000:
        raise ValueError("oversized or invalid instrument master")
    return raw
