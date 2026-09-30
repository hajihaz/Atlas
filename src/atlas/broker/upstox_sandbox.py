"""Upstox sandbox translation boundary.

This module deliberately contains no HTTP client. A transport callable is injected
by the runtime, keeping credentials/network authority outside Atlas core while
allowing deterministic sandbox contract tests.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol

from atlas.broker.adapter import ApprovedOrder, BrokerFill, BrokerOrderReceipt, BrokerOrderStatus

SANDBOX_BASE_URL = "https://sandbox.upstox.com"
PLACE_ORDER_PATH = "/v3/order/place"


@dataclass(frozen=True)
class UpstoxSandboxConfig:
    access_token: str = field(repr=False)
    instrument_tokens: Mapping[str, str]
    product: str = "D"
    validity: str = "DAY"
    order_type: str = "MARKET"

    def validate(self) -> None:
        if not self.access_token:
            raise ValueError("sandbox access token is required at runtime")
        if "sandbox" not in SANDBOX_BASE_URL:
            raise RuntimeError("sandbox endpoint invariant violated")
        if not self.instrument_tokens:
            raise ValueError("instrument token mapping is required")
        if not self.product or not self.validity or not self.order_type:
            raise ValueError("sandbox order configuration is incomplete")


class SandboxTransport(Protocol):
    def __call__(
        self, *, url: str, access_token: str, payload: Mapping[str, Any]
    ) -> Mapping[str, Any]: ...


class UpstoxSandboxAdapter:
    """Translate approved Atlas orders to the Upstox sandbox contract only."""

    def __init__(self, config: UpstoxSandboxConfig, transport: SandboxTransport):
        config.validate()
        self._config = config
        self._transport = transport

    def submit(self, order: ApprovedOrder) -> BrokerOrderReceipt:
        order.validate()
        token = self._config.instrument_tokens.get(order.instrument_id)
        if not token:
            raise ValueError(f"no sandbox instrument token for {order.instrument_id}")
        side = getattr(order, "side", None)
        if side is None:
            raise ValueError("approved order side is required")
        payload = {
            "quantity": order.quantity,
            "product": self._config.product,
            "validity": self._config.validity,
            "price": float(order.limit_price) if order.limit_price is not None else 0,
            "tag": order.idempotency_key,
            "instrument_token": token,
            "order_type": "LIMIT" if order.limit_price is not None else self._config.order_type,
            "transaction_type": side.value,
            "disclosed_quantity": 0,
            "trigger_price": 0,
            "is_amo": False,
        }
        response = self._transport(
            url=SANDBOX_BASE_URL + PLACE_ORDER_PATH,
            access_token=self._config.access_token,
            payload=payload,
        )
        data = response.get("data") if isinstance(response.get("data"), Mapping) else response
        broker_order_id = data.get("order_id") if isinstance(data, Mapping) else None
        if not broker_order_id:
            return BrokerOrderReceipt(order.idempotency_key, None, BrokerOrderStatus.UNKNOWN)
        return BrokerOrderReceipt(
            order.idempotency_key, str(broker_order_id), BrokerOrderStatus.ACCEPTED
        )

    def reconcile(self) -> tuple[BrokerFill, ...]:
        # Sandbox order/trade retrieval is intentionally a separate transport capability.
        # Returning no observations is safer than fabricating fills.
        return ()
