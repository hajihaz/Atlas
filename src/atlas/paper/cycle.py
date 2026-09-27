"""End-to-end deterministic paper cycle: data -> strategy -> risk -> broker -> accounting."""

from __future__ import annotations

import datetime as dt
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal

from atlas.broker.adapter import ApprovedOrder, OrderSide
from atlas.common.hashing import content_hash
from atlas.execution.ledger import ExecutionEvent, ExecutionLedger
from atlas.execution.simulator import Fill
from atlas.paper.broker_simulator import DeterministicPaperBroker
from atlas.portfolio.account import PortfolioAccount
from atlas.reporting.reconcile import reconcile
from atlas.risk.gate import RiskGate


@dataclass(frozen=True)
class PaperCycleResult:
    decision_id: str
    orders: tuple[ApprovedOrder, ...]
    fills: int
    reconciliation_ok: bool
    reconciliation_reasons: tuple[str, ...]


class PaperCycle:
    def __init__(
        self,
        account: PortfolioAccount,
        risk: RiskGate,
        broker: DeterministicPaperBroker,
        ledger: ExecutionLedger,
    ):
        self.account, self.risk, self.broker, self.ledger = account, risk, broker, ledger
        self._accounted_fill_ids: set[str] = set()

    def run(
        self,
        targets: Mapping[str, Decimal],
        *,
        valuation_prices: Mapping[str, Decimal],
        approval_id: str,
        session_id: str = "paper",
    ) -> PaperCycleResult:
        decision_id = content_hash(
            {"session": session_id, "targets": dict(sorted(targets.items()))}
        )
        decision = self.risk.evaluate(targets, equity=self.account.state.equity)
        if not decision.approved:
            raise RuntimeError("risk rejected paper cycle: " + ",".join(decision.reasons))
        orders: list[ApprovedOrder] = []
        for iid, weight in sorted(decision.target_weights.items()):
            current = self.account.state.holdings.get(iid, 0)
            price = valuation_prices[iid]
            desired = int((self.account.state.equity * weight / price).to_integral_value())
            delta = desired - current
            if delta:
                side = OrderSide.BUY if delta > 0 else OrderSide.SELL
                key = content_hash({"decision": decision_id, "instrument": iid})
                orders.append(
                    ApprovedOrder(
                        iid, abs(delta), approval_id=approval_id, idempotency_key=key, side=side
                    )
                )
        self.ledger.append(
            ExecutionEvent(
                decision_id,
                "decision",
                dt.datetime.now(dt.UTC),
                decision_id=decision_id,
                cash=self.account.state.cash,
                equity=self.account.state.equity,
            )
        )
        for order in orders:
            receipt = self.broker.submit(order)
            self.ledger.append(
                ExecutionEvent(
                    order.idempotency_key,
                    "order",
                    dt.datetime.now(dt.UTC),
                    order.instrument_id,
                    order.quantity,
                    decision_id=decision_id,
                    metadata={
                        "status": receipt.status.value,
                        "side": order.side.value if order.side else "",
                    },
                )
            )
        fills = self.broker.reconcile()
        for fill in fills:
            if fill.broker_order_id in self._accounted_fill_ids:
                continue
            matched_order = next(
                (
                    x.order
                    for x in self.broker.orders.values()
                    if x.receipt.broker_order_id == fill.broker_order_id
                ),
                None,
            )
            if matched_order is None:
                raise RuntimeError("paper broker returned an uncorrelated fill")
            signed = fill.quantity if matched_order.side == OrderSide.BUY else -fill.quantity
            self.account.apply_fill(
                Fill(fill.instrument_id, signed, fill.fill_price, fill.fee),
                event_id=fill.broker_order_id,
                valuation_prices=valuation_prices,
            )
            self._accounted_fill_ids.add(fill.broker_order_id)
        broker_positions: dict[str, int] = {}
        for item in self.broker.orders.values():
            if item.receipt.broker_order_id not in self.broker.fills:
                continue
            signed = (
                item.order.quantity if item.order.side == OrderSide.BUY else -item.order.quantity
            )
            broker_positions[item.order.instrument_id] = (
                broker_positions.get(item.order.instrument_id, 0) + signed
            )
        result = reconcile(
            atlas_cash=self.account.state.cash,
            broker_cash=self.account.state.cash,
            atlas_positions=self.account.state.holdings,
            broker_positions=broker_positions,
        )
        self.ledger.verify_integrity()
        return PaperCycleResult(
            decision_id, tuple(orders), len(fills), result.matched, result.reasons
        )
