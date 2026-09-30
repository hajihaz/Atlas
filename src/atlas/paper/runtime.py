"""Persistent-in-process paper runtime; synthetic fills only, never live."""

from __future__ import annotations

import datetime as dt
from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import Decimal

from atlas.common.hashing import content_hash
from atlas.execution.ledger import ExecutionEvent, ExecutionLedger
from atlas.execution.simulator import DiscreteExecutionSimulator, ExecutionConfig, ExecutionResult
from atlas.health import HealthReport
from atlas.market.boundary import MarketDataBoundary, MarketDataStatus
from atlas.operations_hardening import DurableEmergencyStore
from atlas.portfolio.account import PortfolioAccount
from atlas.risk.gate import RiskGate


@dataclass(frozen=True)
class PaperConfig:
    enabled: bool = False
    require_risk_approval: bool = True
    execution: ExecutionConfig = field(default_factory=ExecutionConfig)


@dataclass(frozen=True)
class PaperSnapshot:
    session_id: str
    result_hash: str
    ledger_checkpoint: tuple[int, str]
    cash: Decimal
    holdings: Mapping[str, int]
    equity: Decimal


class PaperRuntime:
    """Paper account with the same capital controls as discrete simulation."""

    def __init__(
        self,
        config: PaperConfig | None = None,
        risk: RiskGate | None = None,
        *,
        emergency_store: DurableEmergencyStore | None = None,
    ):
        self.config = config or PaperConfig()
        self.emergency_store = emergency_store
        self.risk = risk or RiskGate()
        self.ledger = ExecutionLedger()
        self.account: PortfolioAccount | None = None
        self._last_result_hash = ""

    def simulate(
        self,
        *,
        cash: Decimal,
        prices: Mapping[str, Decimal],
        targets: Mapping[str, Decimal],
        fill_prices: Mapping[str, Decimal],
        valuation_prices: Mapping[str, Decimal],
        data_fresh: bool = True,
        kill_switch: bool = False,
        market_data_status: MarketDataStatus | None = None,
        session_id: str = "paper-session",
        event_time: dt.datetime | None = None,
        health: HealthReport | None = None,
    ) -> ExecutionResult:
        if self.emergency_store is not None:
            self.emergency_store.assert_clear()
        if health is not None:
            health.assert_capital_safe()
        if not self.config.enabled:
            raise RuntimeError("paper runtime is disabled")
        if market_data_status is not None:
            MarketDataBoundary().admit(market_data_status)
        decision = self.risk.evaluate(
            targets, equity=cash, data_fresh=data_fresh, kill_switch=kill_switch
        )
        if self.config.require_risk_approval and not decision.approved:
            raise RuntimeError("paper order set rejected by risk: " + ",".join(decision.reasons))
        if not decision.approved:
            raise RuntimeError("paper order set rejected by risk: " + ",".join(decision.reasons))
        if self.account is None:
            self.account = PortfolioAccount(cash=cash)
        result = DiscreteExecutionSimulator(self.config.execution).execute(
            starting_cash=self.account.state.cash,
            prices=prices,
            target_weights=decision.target_weights,
            existing_holdings=self.account.state.holdings,
            fill_prices=fill_prices,
            valuation_prices=valuation_prices,
        )
        decision_id = content_hash(
            {"session": session_id, "targets": dict(sorted(decision.target_weights.items()))}
        )
        self.ledger.append(
            ExecutionEvent(
                decision_id,
                "decision",
                event_time or _deterministic_event_time(),
                decision_id=decision_id,
                cash=self.account.state.cash,
                equity=self.account.state.equity,
                metadata={
                    "session_id": session_id,
                    "targets": dict(sorted(decision.target_weights.items())),
                },
            )
        )
        for intent, fill in zip(result.intents, result.fills, strict=True):
            oid = content_hash(
                {
                    "decision_id": decision_id,
                    "instrument": intent.instrument_id,
                    "quantity": intent.quantity,
                }
            )
            self.ledger.append(
                ExecutionEvent(
                    oid,
                    "order_intent",
                    event_time or _deterministic_event_time(),
                    intent.instrument_id,
                    intent.quantity,
                    intent.reference_price,
                    decision_id=decision_id,
                )
            )
            fid = content_hash({"decision_id": decision_id, "fill": oid})
            transition = self.account.apply_fill(
                fill, event_id=fid, valuation_prices=valuation_prices
            )
            self.ledger.append(
                ExecutionEvent(
                    fid,
                    "fill",
                    event_time or _deterministic_event_time(),
                    fill.instrument_id,
                    fill.quantity,
                    fill.fill_price,
                    fill.fee,
                    transition.cash_after,
                    transition.equity_after,
                    decision_id,
                )
            )
        self.ledger.verify_integrity()
        self._last_result_hash = content_hash(
            {
                "session": session_id,
                "equity": result.equity,
                "fills": [f.__dict__ for f in result.fills],
            }
        )
        return result

    def snapshot(self, session_id: str) -> PaperSnapshot:
        if self.account is None:
            raise RuntimeError("paper account has no state")
        return PaperSnapshot(
            session_id,
            self._last_result_hash,
            self.ledger.head_checkpoint(),
            self.account.state.cash,
            dict(self.account.state.holdings),
            self.account.state.equity,
        )


def _deterministic_event_time() -> dt.datetime:
    """Stable fallback for fixture/replay runs; production callers should provide session time."""
    return dt.datetime(2000, 1, 1, tzinfo=dt.UTC)
