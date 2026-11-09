"""Optional read-only market adapters. No broker or exchange order surface."""

from __future__ import annotations

import re
import time
from datetime import date
from typing import Any


class UpstoxReadOnly:
    """Official SDK transport, constrained to reviewed GET data routes."""

    def __init__(self, token: str, *, rights_approved: bool, client: Any = None):
        if rights_approved is not True:
            raise PermissionError("Intended-use data approval is required")
        if not isinstance(token, str) or len(token.strip()) < 20 or any(c.isspace() for c in token):
            raise ValueError("Private read-only token required")
        if client is None:
            import upstox_client  # type: ignore[import-untyped]

            cfg = upstox_client.Configuration()
            cfg.access_token = token
            cfg.host = "https://api.upstox.com"
            client = upstox_client.ApiClient(cfg)
        self._client = client

    def _get(self, route: str, query: list[tuple[str, str]] | None = None) -> dict[str, Any]:
        try:
            data = self._client.call_api(
                route,
                "GET",
                query_params=query or [],
                header_params={"Accept": "application/json"},
                response_type="object",
                auth_settings=["OAUTH2"],
                _return_http_data_only=True,
                _request_timeout=(3, 8),
            )
        except Exception:
            raise RuntimeError("Read-only provider request unavailable") from None
        if not isinstance(data, dict) or data.get("status") != "success":
            raise ValueError("Unverified provider response")
        return data

    def quotes(self, keys: list[str]) -> dict[str, Any]:
        if (
            not keys
            or len(keys) > 20
            or len(set(keys)) != len(keys)
            or any(not re.fullmatch(r"NSE_EQ\|IN[A-Z0-9]{10}", k) for k in keys)
        ):
            raise ValueError("At most twenty stable NSE equity ISIN keys are allowed")
        return self._get("/v2/market-quote/quotes", [("instrument_key", ",".join(keys))])

    def minute_history(self, key: str, start: str, end: str) -> dict[str, Any]:
        if not re.fullmatch(r"NSE_EQ\|IN[A-Z0-9]{10}", key):
            raise ValueError("Stable NSE equity key required")
        first, last = date.fromisoformat(start), date.fromisoformat(end)
        if not 0 <= (last - first).days <= 27:
            raise ValueError("Historical request exceeds bounded window")
        # Fixed V3 resource. Original/raw history and PIT rights still need certification.
        return self._get(f"/v3/historical-candle/{key.replace('|', '%7C')}/minutes/1/{end}/{start}")

    def ipos(self, *, stage: str = "open", page: int = 1) -> dict[str, Any]:
        if (
            stage not in {"open", "upcoming", "closed", "listed"}
            or type(page) is not int
            or not 1 <= page <= 100
        ):
            raise ValueError("Invalid read-only IPO filter")
        return self._get("/v2/ipos", [("status", stage), ("page_number", str(page))])

    def ipo_details(self, slug: str) -> dict[str, Any]:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,120}", slug):
            raise ValueError("Invalid IPO identity")
        return self._get("/v2/ipos/" + slug)


class KrakenPublicTrades:
    """CCXT's public last-trade observations; preserves native USD, never invents INR."""

    def __init__(self, exchange: Any = None):
        if exchange is None:
            import ccxt  # type: ignore[import-untyped]

            exchange = ccxt.kraken({"enableRateLimit": True, "timeout": 8000})
        self._exchange = exchange

    def last_trade(self, symbol: str, now_ms: int | None = None) -> dict[str, Any]:
        if symbol not in {"BTC/USD", "ETH/USD"}:
            raise ValueError("Unapproved reference market")
        now_ms = int(time.time() * 1000) if now_ms is None else now_ms
        try:
            rows = self._exchange.fetch_trades(symbol, limit=1)
        except Exception:
            raise RuntimeError("Public reference unavailable") from None
        if not isinstance(rows, list) or not rows:
            raise ValueError("No provider trades")
        last = rows[-1]
        ts, price = last.get("timestamp"), last.get("price")
        if (
            type(ts) is not int
            or not -5000 <= now_ms - ts <= 90000
            or type(price) not in (int, float)
            or not 0 < price < 1e12
        ):
            raise ValueError("Invalid or stale provider trade")
        return {
            "symbol": symbol,
            "currency": "USD",
            "price": price,
            "sourceAtMs": ts,
            "provider": "Kraken public trades via CCXT",
            "realOrdersEnabled": False,
            "paperExecutionEnabled": False,
            "inrConversionApplied": False,
        }
