"""Deterministic discrete-share execution simulation primitives."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import ROUND_FLOOR, Decimal


@dataclass(frozen=True)
class ExecutionConfig:
    fee_bps_per_side: Decimal = Decimal("10")
    free_portfolio_value_percentage: Decimal = Decimal("0.0025")
    minimum_order_margin_percentage: Decimal = Decimal("0.001")
    lot_size: int = 1


@dataclass(frozen=True)
class OrderIntent:
    instrument_id: str
    quantity: int
    reference_price: Decimal
    target_weight: Decimal


@dataclass(frozen=True)
class Fill:
    instrument_id: str
    quantity: int
    fill_price: Decimal
    fee: Decimal


@dataclass(frozen=True)
class ExecutionResult:
    starting_cash: Decimal
    ending_cash: Decimal
    holdings: Mapping[str, int]
    intents: tuple[OrderIntent, ...]
    fills: tuple[Fill, ...]
    equity: Decimal


class DiscreteExecutionSimulator:
    """Execute target weights with separate sizing, fill, and valuation prices."""

    def __init__(self, config: ExecutionConfig | None = None) -> None:
        self.config = config or ExecutionConfig()

    def execute(
        self,
        *,
        starting_cash: Decimal,
        prices: Mapping[str, Decimal],
        target_weights: Mapping[str, Decimal],
        existing_holdings: Mapping[str, int] | None = None,
        fill_prices: Mapping[str, Decimal] | None = None,
        valuation_prices: Mapping[str, Decimal] | None = None,
    ) -> ExecutionResult:
        holdings = dict(existing_holdings or {})
        cash = Decimal(starting_cash)
        fill_prices = {k: Decimal(v) for k, v in (fill_prices or prices).items()}
        valuation_prices = {k: Decimal(v) for k, v in (valuation_prices or prices).items()}
        sizing_prices = {k: Decimal(v) for k, v in prices.items()}
        if cash < 0 or self.config.lot_size <= 0:
            raise ValueError("invalid starting cash or lot size")
        if (
            self.config.free_portfolio_value_percentage < 0
            or self.config.free_portfolio_value_percentage >= 1
        ):
            raise ValueError("free portfolio value percentage must be in [0, 1)")
        if (
            self.config.minimum_order_margin_percentage < 0
            or self.config.minimum_order_margin_percentage >= 1
        ):
            raise ValueError("minimum order margin percentage must be in [0, 1)")
        if self.config.fee_bps_per_side < 0:
            raise ValueError("fee bps cannot be negative")
        for iid, price in {**sizing_prices, **fill_prices, **valuation_prices}.items():
            if price <= 0:
                raise ValueError(f"price must be positive for {iid}")
        for iid, weight in target_weights.items():
            if iid not in sizing_prices:
                raise KeyError(f"missing price for {iid}")
            weight = Decimal(weight)
            if weight.is_nan() or weight.is_infinite():
                raise ValueError(f"non-finite target weight for {iid}")
            if weight < 0:
                raise ValueError(
                    f"negative target weight is not supported by the long-only simulator: {iid}"
                )
        # Decision-time valuation only: future fill/mark prices cannot affect sizing.
        portfolio_value = cash + sum(
            Decimal(qty) * sizing_prices.get(iid, Decimal("0")) for iid, qty in holdings.items()
        )
        deployable = portfolio_value * (Decimal("1") - self.config.free_portfolio_value_percentage)
        min_margin = portfolio_value * self.config.minimum_order_margin_percentage
        raw_intents: list[OrderIntent] = []
        for iid in sorted(set(holdings) | set(target_weights)):
            price = sizing_prices[iid]
            target = Decimal(target_weights.get(iid, Decimal("0")))
            lots = (deployable * target / price).to_integral_value(rounding=ROUND_FLOOR)
            desired = int(lots) * self.config.lot_size
            delta = desired - holdings.get(iid, 0)
            if delta and Decimal(abs(delta)) * price >= min_margin:
                raw_intents.append(OrderIntent(iid, delta, fill_prices.get(iid, price), target))

        # Liquidations first free cash; buys are capped by actual cash including fees.
        sells = sorted((i for i in raw_intents if i.quantity < 0), key=lambda i: i.instrument_id)
        buys = sorted((i for i in raw_intents if i.quantity > 0), key=lambda i: i.instrument_id)
        intents: list[OrderIntent] = []
        fills: list[Fill] = []
        fee_rate = self.config.fee_bps_per_side / Decimal("10000")
        for intent in sells + buys:
            price = intent.reference_price
            if intent.quantity > 0:
                per_share = price * (Decimal("1") + fee_rate)
                affordable = int((cash / per_share).to_integral_value(rounding=ROUND_FLOOR))
                qty = min(
                    intent.quantity,
                    (affordable // self.config.lot_size) * self.config.lot_size,
                )
                if qty < self.config.lot_size:
                    continue
                executed = OrderIntent(intent.instrument_id, qty, price, intent.target_weight)
            else:
                executed = intent
            notional = Decimal(abs(executed.quantity)) * price
            fee = notional * fee_rate
            cash += -notional - fee if executed.quantity > 0 else notional - fee
            holdings[executed.instrument_id] = (
                holdings.get(executed.instrument_id, 0) + executed.quantity
            )
            if holdings[executed.instrument_id] == 0:
                del holdings[executed.instrument_id]
            intents.append(executed)
            fills.append(Fill(executed.instrument_id, executed.quantity, price, fee))
        equity = cash + sum(
            Decimal(qty) * valuation_prices.get(iid, sizing_prices[iid])
            for iid, qty in holdings.items()
        )
        return ExecutionResult(
            Decimal(starting_cash),
            cash,
            dict(holdings),
            tuple(intents),
            tuple(fills),
            equity,
        )
