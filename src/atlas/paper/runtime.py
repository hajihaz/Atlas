"""Persistent-in-process paper runtime; synthetic fills only, never live."""

from __future__ import annotations

import datetime as dt
from collections.abc import Mapping
from copy import deepcopy
from dataclasses import dataclass, field
from decimal import Decimal

from atlas.common.hashing import content_hash
from atlas.execution.ledger import ExecutionEvent, ExecutionLedger
from atlas.execution.simulator import DiscreteExecutionSimulator, ExecutionConfig, ExecutionResult
from atlas.health import HealthReport, assert_operational_clear
from atlas.market.boundary import MarketDataBoundary, MarketDataStatus
from atlas.operations_hardening import DurableEmergencyStore
from atlas.portfolio.account import PortfolioAccount
from atlas.risk.gate import RiskGate


@dataclass(frozen=True)
class PaperConfig:
    enabled: bool = False
    require_risk_approval: bool = True
    require_operational_proofs: bool = False
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
        self._peak_equity: Decimal | None = None

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
        assert_operational_clear(
            self.emergency_store,
            health,
            require_proofs=self.config.require_operational_proofs,
        )
        if not self.config.enabled:
            raise RuntimeError("paper runtime is disabled")
        if market_data_status is not None:
            MarketDataBoundary().admit(market_data_status)
        current_equity = (
            self.account.state.position_value(prices) if self.account is not None else Decimal(cash)
        )
        current_weights = (
            {
                instrument: Decimal(quantity) * prices[instrument] / current_equity
                for instrument, quantity in self.account.state.holdings.items()
            }
            if self.account is not None and current_equity > 0
            else {}
        )
        past_equities = [
            event.event.equity
            for event in self.ledger.entries()
            if event.event.event_type in {"decision", "fill", "broker_fill", "mark_to_market"}
            and event.event.equity is not None
            and event.event.equity.is_finite()
        ]
        if self.account is not None and self._peak_equity is None and not past_equities:
            raise RuntimeError("restored paper account lacks trusted peak-equity history")
        peak_equity = max(
            [current_equity, *past_equities]
            + ([self._peak_equity] if self._peak_equity is not None else [])
        )
        decision = self.risk.evaluate(
            targets,
            equity=current_equity,
            data_fresh=data_fresh,
            kill_switch=kill_switch,
            current_weights=current_weights,
            peak_equity=peak_equity,
        )
        if self.config.require_risk_approval and not decision.approved:
            raise RuntimeError("paper order set rejected by risk: " + ",".join(decision.reasons))
        if not decision.approved:
            raise RuntimeError("paper order set rejected by risk: " + ",".join(decision.reasons))
        # Model all fills against private copies. Only publish the new account
        # and ledger after every fill, mark and chain check succeeds.
        working_account = (
            deepcopy(self.account) if self.account is not None else PortfolioAccount(cash=cash)
        )
        working_ledger = deepcopy(self.ledger)
        result = DiscreteExecutionSimulator(self.config.execution).execute(
            starting_cash=working_account.state.cash,
            prices=prices,
            target_weights=decision.target_weights,
            existing_holdings=working_account.state.holdings,
            fill_prices=fill_prices,
            valuation_prices=valuation_prices,
        )
        decision_id = content_hash(
            {"session": session_id, "targets": dict(sorted(decision.target_weights.items()))}
        )
        working_ledger.append(
            ExecutionEvent(
                decision_id,
                "decision",
                event_time or _deterministic_event_time(),
                decision_id=decision_id,
                cash=working_account.state.cash,
                equity=working_account.state.equity,
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
            working_ledger.append(
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
            transition = working_account.apply_fill(
                fill, event_id=fid, valuation_prices=valuation_prices
            )
            working_ledger.append(
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
        marked = working_account.mark_to_market(valuation_prices=valuation_prices)
        if (
            marked.cash != result.ending_cash
            or dict(marked.holdings) != dict(result.holdings)
            or marked.equity != result.equity
        ):
            raise RuntimeError("paper simulator/account mark-to-market divergence")
        working_ledger.append(
            ExecutionEvent(
                content_hash(
                    {"session": session_id, "mark": dict(sorted(valuation_prices.items()))}
                ),
                "mark_to_market",
                event_time or _deterministic_event_time(),
                cash=marked.cash,
                equity=marked.equity,
                decision_id=decision_id,
                metadata={
                    "session_id": session_id,
                    "valuation_prices": dict(sorted(valuation_prices.items())),
                },
            )
        )
        working_ledger.verify_integrity()
        result_hash = content_hash(
            {
                "session": session_id,
                "equity": result.equity,
                "fills": [f.__dict__ for f in result.fills],
            }
        )
        self.account = working_account
        self.ledger = working_ledger
        self._last_result_hash = result_hash
        self._peak_equity = max(peak_equity, result.equity)
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
