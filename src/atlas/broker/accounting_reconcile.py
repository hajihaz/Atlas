"""Fail-closed broker/account reconciliation and idempotent observation application."""

from __future__ import annotations

import datetime as dt
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal

from atlas.broker.adapter import BrokerFill
from atlas.execution.ledger import ExecutionEvent, ExecutionLedger
from atlas.operations_hardening import AppliedEventStore
from atlas.portfolio.account import PortfolioAccount, PortfolioTransition


@dataclass(frozen=True)
class AccountSnapshot:
    cash: Decimal
    positions: Mapping[str, int]
    equity: Decimal


@dataclass(frozen=True)
class AccountingResult:
    applied: tuple[PortfolioTransition, ...]
    ignored_duplicate_event_ids: tuple[str, ...]


class BrokerAccountingReconciler:
    def __init__(
        self,
        account: PortfolioAccount,
        ledger: ExecutionLedger,
        event_store: AppliedEventStore | None = None,
    ):
        self.account, self.ledger = account, ledger
        self.event_store = event_store
        self._applied: set[str] = {
            entry.event.event_id
            for entry in ledger.entries()
            if entry.event.event_type == "broker_fill"
        }
        if event_store is not None:
            self._applied.update(event_store.load())

    def apply_fill(
        self,
        fill: BrokerFill,
        *,
        trade_id: str,
        side: str,
        valuation_prices: Mapping[str, Decimal],
        event_time: dt.datetime | None = None,
    ) -> PortfolioTransition | None:
        if not trade_id or trade_id in self._applied:
            return None
        if side.upper() not in {"BUY", "SELL"}:
            raise ValueError("unknown trade side")
        signed_qty = fill.quantity if side.upper() == "BUY" else -fill.quantity
        from atlas.execution.simulator import Fill

        transition = self.account.apply_fill(
            Fill(fill.instrument_id, signed_qty, fill.fill_price, fill.fee),
            event_id=trade_id,
            valuation_prices=valuation_prices,
        )
        self.ledger.append(
            ExecutionEvent(
                trade_id,
                "broker_fill",
                event_time or dt.datetime.now(dt.UTC),
                fill.instrument_id,
                signed_qty,
                fill.fill_price,
                fill.fee,
                transition.cash_after,
                transition.equity_after,
                metadata={"broker_order_id": fill.broker_order_id, "side": side.upper()},
            )
        )
        self._applied.add(trade_id)
        if self.event_store is not None:
            self.event_store.save(self._applied)
        return transition

    def reconcile(
        self, broker: AccountSnapshot, *, tolerance: Decimal = Decimal("0.01")
    ) -> tuple[bool, tuple[str, ...]]:
        state = self.account.state
        reasons = []
        if abs(broker.cash - state.cash) > tolerance:
            reasons.append("cash_mismatch")
        if dict(broker.positions) != dict(state.holdings):
            reasons.append("position_mismatch")
        if abs(broker.equity - state.equity) > tolerance:
            reasons.append("equity_mismatch")
        return (not reasons, tuple(reasons))
