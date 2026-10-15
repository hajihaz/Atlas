"""Deterministic portfolio/accounting state; no broker authority."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal

from atlas.execution.simulator import Fill


@dataclass(frozen=True)
class PortfolioState:
    cash: Decimal
    holdings: Mapping[str, int]
    equity: Decimal

    def position_value(self, prices: Mapping[str, Decimal]) -> Decimal:
        return self.cash + sum(Decimal(q) * prices[i] for i, q in self.holdings.items())

    def validate(self) -> None:
        if self.cash < 0:
            raise ValueError("portfolio cash cannot be negative")
        if any(q < 0 for q in self.holdings.values()):
            raise ValueError("long-only portfolio cannot contain negative positions")
        if self.equity < 0:
            raise ValueError("portfolio equity cannot be negative")


@dataclass(frozen=True)
class PortfolioTransition:
    sequence: int
    event_id: str
    instrument_id: str
    quantity: int
    fill_price: Decimal
    fee: Decimal
    cash_before: Decimal
    cash_after: Decimal
    position_before: int
    position_after: int
    equity_after: Decimal

    @property
    def notional(self) -> Decimal:
        return Decimal(abs(self.quantity)) * self.fill_price


class PortfolioAccount:
    """Authoritative deterministic accounting for discrete fills.

    The account consumes observed/simulated fills only. It cannot submit orders and
    cannot access a broker. Every accepted fill creates one immutable transition.
    """

    def __init__(
        self,
        *,
        cash: Decimal,
        holdings: Mapping[str, int] | None = None,
        equity: Decimal | None = None,
    ):
        resolved_equity = Decimal(cash) if equity is None else Decimal(equity)
        self._state = PortfolioState(Decimal(cash), dict(holdings or {}), resolved_equity)
        self._transitions: list[PortfolioTransition] = []
        self._state.validate()

    @property
    def state(self) -> PortfolioState:
        return self._state

    def apply_fill(
        self, fill: Fill, *, event_id: str, valuation_prices: Mapping[str, Decimal]
    ) -> PortfolioTransition:
        if not event_id:
            raise ValueError("event_id is required")
        if fill.quantity == 0 or fill.fill_price <= 0 or fill.fee < 0:
            raise ValueError("invalid fill")
        before = self._state
        position_before = before.holdings.get(fill.instrument_id, 0)
        position_after = position_before + fill.quantity
        if position_after < 0:
            raise ValueError("fill would create a short position")
        notional = Decimal(abs(fill.quantity)) * fill.fill_price
        cash_after = (
            before.cash - notional - fill.fee
            if fill.quantity > 0
            else before.cash + notional - fill.fee
        )
        if cash_after < 0:
            raise ValueError("fill would create negative cash")
        holdings = dict(before.holdings)
        if position_after:
            holdings[fill.instrument_id] = position_after
        else:
            holdings.pop(fill.instrument_id, None)
        if any(i not in valuation_prices for i in holdings):
            raise KeyError("missing valuation price for portfolio position")
        equity_after = cash_after + sum(
            Decimal(q) * valuation_prices[i] for i, q in holdings.items()
        )
        transition = PortfolioTransition(
            len(self._transitions),
            event_id,
            fill.instrument_id,
            fill.quantity,
            fill.fill_price,
            fill.fee,
            before.cash,
            cash_after,
            position_before,
            position_after,
            equity_after,
        )
        self._transitions.append(transition)
        self._state = PortfolioState(cash_after, holdings, equity_after)
        self._state.validate()
        return transition

    def mark_to_market(self, *, valuation_prices: Mapping[str, Decimal]) -> PortfolioState:
        """Update equity from current marks without manufacturing a fill or cash event."""
        for instrument, quantity in self._state.holdings.items():
            if instrument not in valuation_prices:
                raise ValueError(f"missing valuation price for position: {instrument}")
            price = Decimal(valuation_prices[instrument])
            if not price.is_finite() or price <= 0 or quantity < 0:
                raise ValueError("invalid mark-to-market valuation")
        equity = self._state.position_value(valuation_prices)
        if not equity.is_finite():
            raise ValueError("non-finite marked portfolio equity")
        state = PortfolioState(self._state.cash, dict(self._state.holdings), equity)
        state.validate()
        self._state = state
        return state

    def transitions(self) -> tuple[PortfolioTransition, ...]:
        return tuple(self._transitions)
