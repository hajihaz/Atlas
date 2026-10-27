"""Public read-only CoinDCX network adapter, isolated from Atlas capital boundary.

This module never imports any broker-write authority. Raw provider data is
normalized and strictly checked by the core paper runner.
"""

from __future__ import annotations

import json
import time
import urllib.request
from typing import Any

from atlas.paper.live_runner import decode_tickers

SOURCE_URL = "https://api.coindcx.com/exchange/ticker"


def fetch_quotes(now: int | None = None) -> list[dict[str, Any]]:
    req = urllib.request.Request(
        SOURCE_URL,
        headers={"Accept": "application/json", "User-Agent": "AtlasPaperResearch/1.0"},
    )
    with urllib.request.urlopen(req, timeout=12) as response:  # noqa: S310 - fixed HTTPS URL
        if response.status != 200:
            raise ValueError("public observation provider unavailable")
        body = response.read(5_000_001)
        if len(body) > 5_000_000:
            raise ValueError("provider payload too large")
    # Validate against actual response receipt, not the clock before network latency.
    received_at = int(time.time()) if now is None else now
    return decode_tickers(json.loads(body), received_at)
