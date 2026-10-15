"""Deterministic Upstox order/trade reconciliation.

Provider observations are facts only. No observation is promoted to a fill unless
its required fields validate, and duplicate trades are ignored deterministically.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from atlas.broker.adapter import BrokerFill, BrokerOrderReceipt, BrokerOrderStatus, OrderSide
from atlas.common.hashing import content_hash
from atlas.execution.simulator import Fill
from atlas.portfolio.account import PortfolioAccount, PortfolioTransition

STATUS_MAP = {
    "open pending": BrokerOrderStatus.ACCEPTED,
    "open": BrokerOrderStatus.ACCEPTED,
    "complete": BrokerOrderStatus.FILLED,
    "filled": BrokerOrderStatus.FILLED,
    "partially filled": BrokerOrderStatus.PARTIALLY_FILLED,
    "partial": BrokerOrderStatus.PARTIALLY_FILLED,
    "cancelled": BrokerOrderStatus.CANCELLED,
    "rejected": BrokerOrderStatus.REJECTED,
}


@dataclass(frozen=True)
class ProviderTrade:
    trade_id: str
    broker_order_id: str
    instrument_id: str
    quantity: int
    fill_price: Decimal
    fee: Decimal
    side: OrderSide

    def to_fill(self) -> BrokerFill:
        return BrokerFill(
            self.broker_order_id, self.instrument_id, self.quantity, self.fill_price, self.fee
        )


def map_order_status(raw_status: Any) -> BrokerOrderStatus:
    if not isinstance(raw_status, str):
        return BrokerOrderStatus.UNKNOWN
    return STATUS_MAP.get(raw_status.strip().lower(), BrokerOrderStatus.UNKNOWN)


def map_order(raw: Mapping[str, Any]) -> BrokerOrderReceipt:
    order_id = raw.get("order_id")
    if not order_id:
        return BrokerOrderReceipt("", None, BrokerOrderStatus.UNKNOWN)
    client_id = str(raw.get("tag") or raw.get("correlation_id") or "")
    return BrokerOrderReceipt(
        client_id, str(order_id), map_order_status(raw.get("status") or raw.get("order_status"))
    )


def parse_trade(raw: Mapping[str, Any]) -> ProviderTrade | None:
    try:
        trade_id = str(raw["trade_id"])
        order_id = str(raw["order_id"])
        instrument = str(raw["instrument_token"])
        raw_qty = raw["quantity"]
        if isinstance(raw_qty, bool) or str(raw_qty).strip() != str(int(raw_qty)):
            return None
        qty = int(raw_qty)
        price = Decimal(str(raw["average_price"] if "average_price" in raw else raw["fill_price"]))
        fee = Decimal(str(raw.get("fees", raw.get("fee", "0"))))
        side = OrderSide(str(raw.get("transaction_type", raw.get("side"))).upper())
    except (KeyError, TypeError, ValueError, InvalidOperation):
        return None
    if (
        not trade_id
        or trade_id in {"None", "nan"}
        or not order_id
        or order_id in {"None", "nan"}
        or not instrument
        or instrument in {"None", "nan"}
        or qty <= 0
        or not price.is_finite()
        or not fee.is_finite()
        or price <= 0
        or fee < 0
    ):
        return None
    return ProviderTrade(trade_id, order_id, instrument, qty, price, fee, side)


def deduplicate_trades(trades: list[ProviderTrade]) -> tuple[ProviderTrade, ...]:
    seen: dict[str, ProviderTrade] = {}
    result: list[ProviderTrade] = []
    for trade in trades:
        prior = seen.get(trade.trade_id)
        if prior is not None:
            if prior != trade:
                raise RuntimeError("conflicting broker trade ID replay")
            continue
        seen[trade.trade_id] = trade
        result.append(trade)
    return tuple(result)


def apply_provider_trades_to_account(
    account: PortfolioAccount,
    trades: Iterable[ProviderTrade],
    *,
    valuation_prices: Mapping[str, Decimal],
) -> tuple[PortfolioTransition, ...]:
    """Apply each previously unseen provider trade exactly once.

    Provider trade IDs are the replay/idempotency boundary. The resulting portfolio
    transition event ID is derived from the provider trade ID and is stable across
    reconciliation retries.
    """
    applied = {t.event_id: t for t in account.transitions()}
    # Validate the entire batch against a shadow account before changing the
    # authoritative account. An invalid later fill must not leave a partial batch.
    staged = PortfolioAccount(
        cash=account.state.cash,
        holdings=account.state.holdings,
        equity=account.state.equity,
    )
    pending: list[tuple[str, Fill]] = []
    for trade in deduplicate_trades(list(trades)):
        event_id = content_hash({"provider": "upstox", "trade_id": trade.trade_id})
        old = applied.get(event_id)
        signed_qty = trade.quantity if trade.side is OrderSide.BUY else -trade.quantity
        if old is not None:
            if (
                old.instrument_id != trade.instrument_id
                or old.quantity != signed_qty
                or old.fill_price != trade.fill_price
                or old.fee != trade.fee
            ):
                raise RuntimeError("conflicting persisted broker trade replay")
            continue
        fill = Fill(trade.instrument_id, signed_qty, trade.fill_price, trade.fee)
        staged.apply_fill(fill, event_id=event_id, valuation_prices=valuation_prices)
        pending.append((event_id, fill))
    return tuple(
        account.apply_fill(fill, event_id=event_id, valuation_prices=valuation_prices)
        for event_id, fill in pending
    )
