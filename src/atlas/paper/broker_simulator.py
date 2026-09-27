"""Deterministic broker simulator for paper-cycle and failure-path validation.

It is deliberately separate from external transports and can never reach a network.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_DOWN, Decimal

from atlas.broker.adapter import ApprovedOrder, BrokerFill, BrokerOrderReceipt, BrokerOrderStatus


@dataclass(frozen=True)
class PaperBrokerConfig:
    fee_bps: Decimal = Decimal("0")
    slippage_bps: Decimal = Decimal("0")
    fill_fraction: Decimal = Decimal("1")
    reject_instruments: frozenset[str] = frozenset()

    def validate(self) -> None:
        if self.fee_bps < 0 or self.slippage_bps < 0:
            raise ValueError("paper broker costs cannot be negative")
        if not Decimal("0") <= self.fill_fraction <= Decimal("1"):
            raise ValueError("fill_fraction must be in [0, 1]")


@dataclass(frozen=True)
class SimulatedOrder:
    receipt: BrokerOrderReceipt
    order: ApprovedOrder


class DeterministicPaperBroker:
    """In-memory broker supporting deterministic reject/partial/full-fill scenarios."""

    def __init__(
        self,
        prices: dict[str, Decimal],
        config: PaperBrokerConfig | None = None,
    ):
        self.prices = dict(prices)
        self.config = config or PaperBrokerConfig()
        self.config.validate()
        self.orders: dict[str, SimulatedOrder] = {}
        self.fills: dict[str, BrokerFill] = {}

    def submit(self, order: ApprovedOrder) -> BrokerOrderReceipt:
        order.validate()
        if order.idempotency_key in self.orders:
            return self.orders[order.idempotency_key].receipt
        price = self.prices.get(order.instrument_id)
        if order.instrument_id in self.config.reject_instruments:
            receipt = BrokerOrderReceipt(order.idempotency_key, None, BrokerOrderStatus.REJECTED)
        elif price is None or price <= 0:
            receipt = BrokerOrderReceipt(order.idempotency_key, None, BrokerOrderStatus.UNKNOWN)
        else:
            broker_id = "paper-" + order.idempotency_key
            fill_qty = int(
                (Decimal(order.quantity) * self.config.fill_fraction).to_integral_value(
                    rounding=ROUND_DOWN
                )
            )
            if fill_qty == 0:
                receipt = BrokerOrderReceipt(
                    order.idempotency_key, broker_id, BrokerOrderStatus.ACCEPTED
                )
            else:
                status = (
                    BrokerOrderStatus.FILLED
                    if fill_qty == order.quantity
                    else BrokerOrderStatus.PARTIALLY_FILLED
                )
                receipt = BrokerOrderReceipt(order.idempotency_key, broker_id, status)
                slip = self.config.slippage_bps / Decimal("10000")
                fill_price = price * (Decimal("1") + slip)
                fee = Decimal(fill_qty) * fill_price * self.config.fee_bps / Decimal("10000")
                self.fills[broker_id] = BrokerFill(
                    broker_id, order.instrument_id, fill_qty, fill_price, fee
                )
        self.orders[order.idempotency_key] = SimulatedOrder(receipt, order)
        return receipt

    def cancel(self, broker_order_id: str) -> BrokerOrderReceipt:
        for key, item in self.orders.items():
            if item.receipt.broker_order_id != broker_order_id:
                continue
            if item.receipt.status == BrokerOrderStatus.FILLED:
                return item.receipt
            receipt = BrokerOrderReceipt(key, broker_order_id, BrokerOrderStatus.CANCELLED)
            self.orders[key] = SimulatedOrder(receipt, item.order)
            self.fills.pop(broker_order_id, None)
            return receipt
        return BrokerOrderReceipt("", broker_order_id, BrokerOrderStatus.UNKNOWN)

    def get_order_status(self, broker_order_id: str) -> BrokerOrderReceipt:
        for item in self.orders.values():
            if item.receipt.broker_order_id == broker_order_id:
                return item.receipt
        return BrokerOrderReceipt("", broker_order_id, BrokerOrderStatus.UNKNOWN)

    def reconcile(self) -> tuple[BrokerFill, ...]:
        return tuple(self.fills[k] for k in sorted(self.fills))
