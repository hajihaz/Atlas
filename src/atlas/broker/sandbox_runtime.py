"""Runtime wiring for Upstox sandbox credentials.

Credentials are loaded only from the process environment. This module has no production
broker configuration and never persists tokens. Network calls remain in the injected
sandbox transport.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass

from atlas.broker.upstox_sandbox import UpstoxSandboxAdapter, UpstoxSandboxConfig
from atlas.broker.upstox_transport import UpstoxSandboxHttpTransport

ENV_TOKEN = "UPSTOX_SANDBOX_ACCESS_TOKEN"  # noqa: S105 - environment variable name, not a secret


@dataclass(frozen=True)
class SandboxRuntimeConfig:
    instrument_tokens: Mapping[str, str]
    product: str = "D"
    validity: str = "DAY"
    order_type: str = "MARKET"


def load_sandbox_adapter(config: SandboxRuntimeConfig) -> UpstoxSandboxAdapter:
    token = os.environ.get(ENV_TOKEN, "")
    if not token:
        raise RuntimeError(f"{ENV_TOKEN} is not set; sandbox credentials are required")
    sandbox = UpstoxSandboxConfig(
        token,
        config.instrument_tokens,
        product=config.product,
        validity=config.validity,
        order_type=config.order_type,
    )
    return UpstoxSandboxAdapter(sandbox, UpstoxSandboxHttpTransport(token))
