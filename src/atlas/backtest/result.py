"""The immutable result of one backtest, including audit and accounting provenance."""

from __future__ import annotations

import datetime as _dt
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from atlas.common.hashing import content_hash
from atlas.execution.ledger import ExecutionLedgerEntry
from atlas.portfolio.account import PortfolioTransition

_HASH_DECIMALS = 10


@dataclass(frozen=True)
class BacktestResult:
    """Per-session returns, equity curve, provenance, execution ledger and accounting."""

    config_id: str
    strategy_name: str
    strategy_version: str
    params: Mapping[str, Any]
    start: _dt.date
    end: _dt.date
    dates: tuple[_dt.date, ...]
    net_returns: tuple[float, ...]
    gross_returns: tuple[float, ...]
    turnover: tuple[float, ...]
    equity: tuple[float, ...]
    periods_per_year: int
    cost_model: Mapping[str, float]
    snapshot_id: str | None = None
    seed: int | None = None
    code_version: str | None = None
    meta: Mapping[str, Any] = field(default_factory=dict)
    execution_ledger: tuple[ExecutionLedgerEntry, ...] = ()
    portfolio_transitions: tuple[PortfolioTransition, ...] = ()

    @property
    def total_return(self) -> float:
        return self.equity[-1] - 1.0 if self.equity else 0.0

    def result_hash(self) -> str:
        """Deterministic content hash including capital-affecting audit records."""
        return content_hash(
            {
                "config_id": self.config_id,
                "strategy_name": self.strategy_name,
                "strategy_version": self.strategy_version,
                "params": dict(self.params),
                "snapshot_id": self.snapshot_id,
                "seed": self.seed,
                "cost_model": dict(self.cost_model),
                "meta": dict(self.meta),
                "execution_ledger": [e.chain_hash for e in self.execution_ledger],
                "portfolio_transitions": [
                    {
                        "sequence": t.sequence,
                        "event_id": t.event_id,
                        "instrument_id": t.instrument_id,
                        "quantity": t.quantity,
                        "fill_price": t.fill_price,
                        "fee": t.fee,
                        "cash_before": t.cash_before,
                        "cash_after": t.cash_after,
                        "position_before": t.position_before,
                        "position_after": t.position_after,
                        "equity_after": t.equity_after,
                    }
                    for t in self.portfolio_transitions
                ],
                "dates": [d.isoformat() for d in self.dates],
                "equity": [round(e, _HASH_DECIMALS) for e in self.equity],
            }
        )

    def to_summary(self) -> dict[str, Any]:
        return {
            "config_id": self.config_id,
            "strategy": f"{self.strategy_name} v{self.strategy_version}",
            "params": dict(self.params),
            "period": f"{self.start.isoformat()}..{self.end.isoformat()}",
            "sessions": len(self.dates),
            "total_return": round(self.total_return, 6),
            "ledger_events": len(self.execution_ledger),
            "portfolio_transitions": len(self.portfolio_transitions),
            "result_hash": self.result_hash(),
        }
