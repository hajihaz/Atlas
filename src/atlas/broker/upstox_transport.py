"""Runtime-only HTTP transport for the Upstox sandbox.

The transport owns network authority; Atlas order logic remains transport-agnostic.
It refuses every non-sandbox URL and never logs or returns the access token.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from atlas.broker.upstox_sandbox import SANDBOX_BASE_URL


class TransportError(RuntimeError):
    pass


class TransportAuthError(TransportError):
    pass


class TransportRetryableError(TransportError):
    pass


class TransportResponseError(TransportError):
    pass


@dataclass(frozen=True)
class UpstoxSandboxHttpTransport:
    access_token: str
    timeout_seconds: float = 10.0

    def __post_init__(self) -> None:
        if not self.access_token:
            raise ValueError("sandbox access token is required")
        if self.timeout_seconds <= 0 or self.timeout_seconds > 60:
            raise ValueError("timeout_seconds must be > 0 and <= 60")

    def __call__(
        self, *, url: str, access_token: str, payload: Mapping[str, Any]
    ) -> Mapping[str, Any]:
        if not url.startswith(SANDBOX_BASE_URL + "/"):
            raise TransportError("sandbox transport refuses non-sandbox URL")
        if access_token != self.access_token:
            raise TransportAuthError("transport token mismatch")
        body = json.dumps(dict(payload), separators=(",", ":")).encode("utf-8")
        request = Request(  # noqa: S310 - URL is fixed to the sandbox origin
            url,
            data=body,
            method="POST",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.access_token}",
            },
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:  # noqa: S310 - fixed sandbox URL
                raw = response.read()
        except HTTPError as exc:
            if exc.code in (401, 403):
                raise TransportAuthError(f"sandbox authentication failed ({exc.code})") from exc
            if exc.code in (408, 425, 429) or 500 <= exc.code <= 599:
                raise TransportRetryableError(
                    f"sandbox transport retryable HTTP {exc.code}"
                ) from exc
            raise TransportResponseError(f"sandbox transport HTTP {exc.code}") from exc
        except URLError as exc:
            raise TransportRetryableError("sandbox network failure") from exc
        except TimeoutError as exc:
            raise TransportRetryableError("sandbox request timed out") from exc
        try:
            decoded = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise TransportResponseError("sandbox response was not valid JSON") from exc
        if not isinstance(decoded, Mapping):
            raise TransportResponseError("sandbox response must be a JSON object")
        return decoded
