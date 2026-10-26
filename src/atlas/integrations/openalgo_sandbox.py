"""OpenAlgo observer/preview only. Impossible to place broker orders from this adapter.

OpenAlgo /api/v1/placeorder is dual-use: with analyzer disabled it routes to
LIVE capital. Therefore the Atlas integration never calls this path, even after
reading analyzer mode (which can change between HTTP requests).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from urllib.parse import urlsplit

from atlas.market.read_only_transport import local_openalgo_analyzer_post


@dataclass(frozen=True)
class SandboxPreview:
    symbol: str
    quantity: int
    action: str
    destination: str = "ATLAS_LOCAL_PAPER_ONLY"
    submit_enabled: bool = False


def preview_order(symbol: str, action: str, quantity: int) -> SandboxPreview:
    if not symbol.isascii() or not symbol.isalnum() or len(symbol) > 32:
        raise ValueError("bad sandbox symbol")
    if action not in ("BUY", "SELL") or not 1 <= quantity <= 100_000:
        raise ValueError("invalid simulated order")
    return SandboxPreview(symbol, quantity, action)


def observe_analyzer(
    base_url: str, api_key: str, *, post_json: Callable[[str, dict[str, str]], object] | None = None
) -> dict[str, object]:
    """Read OpenAlgo analyzer mode on loopback. Never call toggle or placeorder."""
    url = urlsplit(base_url)
    if (
        url.scheme != "http"
        or url.hostname != "127.0.0.1"
        or url.username is not None
        or url.password is not None
        or url.path not in ("", "/")
        or url.query
        or url.fragment
        or url.port is None
    ):
        raise ValueError("OpenAlgo observer accepts only explicit local host and port")
    if not api_key:
        raise RuntimeError("OpenAlgo API key unavailable")
    target = base_url.rstrip("/") + "/api/v1/analyzer"
    if post_json is None:
        post_json = local_openalgo_analyzer_post
    try:
        response = post_json(target, {"apikey": api_key})
    except Exception:
        raise RuntimeError("OpenAlgo sandbox status unavailable") from None
    if not isinstance(response, dict) or response.get("status") != "success":
        raise ValueError("unexpected analyzer status")
    data = response.get("data")
    if not isinstance(data, dict) or type(data.get("analyze_mode")) is not bool:
        raise ValueError("OpenAlgo analyzer response lacks trusted mode")
    mode = data.get("mode")
    if mode not in ("analyze", "live") or (mode == "analyze") != data["analyze_mode"]:
        raise ValueError("OpenAlgo analyzer mode mismatch")
    return {
        "connected": True,
        "analyzer_enabled": data["analyze_mode"],
        "orders_enabled": False,
        "warning": (
            "Observer only; Atlas uses local paper engine. OpenAlgo order APIs are dual-use."
        ),
    }
