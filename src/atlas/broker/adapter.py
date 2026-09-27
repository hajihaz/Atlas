"""Broker boundary contracts; transport implementations remain outside Atlas core.

Step 29 establishes an explicit, fail-closed broker contract without network authority.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from typing import Protocol


class OrderSide(StrEnum):
    BUY = "BUY"
    SELL = "SELL"


class BrokerOrderStatus(StrEnum):
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    PARTIALLY_FILLED = "partially_filled"
    FILLED = "filled"
    CANCELLED = "cancelled"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class ApprovedOrder:
    instrument_id: str
    quantity: int
    limit_price: Decimal | None = None
    approval_id: str = ""
    idempotency_key: str = ""
    side: OrderSide | None = None

    def validate(self) -> None:
        if (
            not self.instrument_id
            or self.quantity == 0
            or not self.approval_id
            or not self.idempotency_key
            or self.side is None
        ):
            raise ValueError(
                "instrument, non-zero quantity, side, approval_id and idempotency_key are required"
            )
        if self.quantity < 0:
            raise ValueError(
                "broker contract uses positive quantity; direction belongs in order side"
            )
        if self.limit_price is not None and self.limit_price <= 0:
            raise ValueError("limit price must be positive")


@dataclass(frozen=True)
class BrokerFill:
    broker_order_id: str
    instrument_id: str
    quantity: int
    fill_price: Decimal
    fee: Decimal


@dataclass(frozen=True)
class BrokerOrderReceipt:
    client_order_id: str
    broker_order_id: str | None
    status: BrokerOrderStatus


class BrokerAdapter(Protocol):
    """Transport boundary. Implementations require separate production authorization."""

    def submit(self, order: ApprovedOrder) -> BrokerOrderReceipt: ...
    def get_order_status(self, broker_order_id: str) -> BrokerOrderReceipt: ...
    def reconcile(self) -> tuple[BrokerFill, ...]: ...


class DisabledBrokerAdapter:
    """Safe default: any attempt to cross the broker boundary is denied."""

    def submit(self, order: ApprovedOrder) -> BrokerOrderReceipt:
        raise RuntimeError("broker execution is disabled; no live adapter is configured")

    def get_order_status(self, broker_order_id: str) -> BrokerOrderReceipt:
        raise RuntimeError("broker order status is disabled; no live adapter is configured")

    def reconcile(self) -> tuple[BrokerFill, ...]:
        raise RuntimeError("broker reconciliation is disabled; no live adapter is configured")
