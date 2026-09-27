"""Transaction-cost model — explicit, conservative, auditable (Phase-3 exit criterion).

Cost is charged on **turnover** (the sum of absolute weight changes at each rebalance). The
default is deliberately conservative for NSE cash equities: costs that are too optimistic are
how a backtest lies, so Atlas rounds *against* the strategy (principle: cost realism). A more
sophisticated participation-rate / market-impact model plugs in behind this interface later.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CostModel:
    """Per-side cost in basis points of traded notional (commission + slippage + impact)."""

    bps_per_side: float = 10.0  # conservative default; ~20 bps round-trip

    def cost(self, turnover: float) -> float:
        """Cost as a fraction of portfolio value for a given ``turnover`` (Σ|Δweight|)."""
        return turnover * (self.bps_per_side / 10_000.0)

    def describe(self) -> dict[str, float]:
        """Auditable summary of the cost assumptions (recorded with every backtest)."""
        return {"bps_per_side": self.bps_per_side}
