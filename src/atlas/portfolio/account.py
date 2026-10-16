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
        if not self.cash.is_finite() or self.cash < 0:
            raise ValueError("portfolio cash must be finite and nonnegative")
        if any(type(q) is not int or q < 0 for q in self.holdings.values()):
            raise ValueError("long-only portfolio requires nonnegative integer positions")
        if not self.equity.is_finite() or self.equity < 0:
            raise ValueError("portfolio equity must be finite and nonnegative")


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

    @classmethod
    def restore_with_transitions(
        cls,
        *,
        cash: Decimal,
        holdings: Mapping[str, int],
        equity: Decimal,
        transitions: tuple[PortfolioTransition, ...],
    ) -> PortfolioAccount:
        """Restore immutable fill identities only after checking every cash/share transition."""
        result = cls(cash=cash, holdings=holdings, equity=equity)
        original = dict(holdings)
        for item in transitions:
            original[item.instrument_id] = original.get(item.instrument_id, 0) - item.quantity
        if any(type(quantity) is not int or quantity < 0 for quantity in original.values()):
            raise ValueError("paper recovery implies invalid opening positions")
        positions = {key: value for key, value in original.items() if value}
        running_cash = transitions[0].cash_before if transitions else result.state.cash
        seen: set[str] = set()
        for seq, item in enumerate(transitions):
            numeric = (
                item.fill_price,
                item.fee,
                item.cash_before,
                item.cash_after,
                item.equity_after,
            )
            if (
                type(item.sequence) is not int
                or item.sequence != seq
                or not item.event_id
                or item.event_id in seen
                or not item.instrument_id
                or type(item.quantity) is not int
                or item.quantity == 0
                or type(item.position_before) is not int
                or type(item.position_after) is not int
                or any(not value.is_finite() for value in numeric)
                or item.fill_price <= 0
                or item.fee < 0
                or item.cash_before != running_cash
                or item.position_before != positions.get(item.instrument_id, 0)
            ):
                raise ValueError("invalid restored paper transition")
            changed = item.position_before + item.quantity
            expected_cash = running_cash - Decimal(item.quantity) * item.fill_price - item.fee
            if (
                changed < 0
                or changed != item.position_after
                or expected_cash != item.cash_after
                or item.cash_after < 0
                or item.equity_after < 0
            ):
                raise ValueError("paper recovery cash/position transition mismatch")
            if changed:
                positions[item.instrument_id] = changed
            else:
                positions.pop(item.instrument_id, None)
            running_cash = item.cash_after
            seen.add(item.event_id)
        if running_cash != cash or positions != {k: v for k, v in holdings.items() if v}:
            raise ValueError("restored paper transitions disagree with snapshot")
        result._transitions = list(transitions)
        return result

    def apply_fill(
        self, fill: Fill, *, event_id: str, valuation_prices: Mapping[str, Decimal]
    ) -> PortfolioTransition:
        if not event_id:
            raise ValueError("event_id is required")
        if any(transition.event_id == event_id for transition in self._transitions):
            raise RuntimeError("duplicate portfolio fill event ID")
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
