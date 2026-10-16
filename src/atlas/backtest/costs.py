"""Transaction-cost model — explicit, conservative, auditable (Phase-3 exit criterion).

Cost is charged on **turnover** (the sum of absolute weight changes at each rebalance). The
default is deliberately conservative for NSE cash equities: costs that are too optimistic are
how a backtest lies, so Atlas rounds *against* the strategy (principle: cost realism). A more
sophisticated participation-rate / market-impact model plugs in behind this interface later.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite


@dataclass(frozen=True)
class CostModel:
    """Per-side cost in basis points of traded notional (commission + slippage + impact)."""

    bps_per_side: float = 10.0  # conservative default; ~20 bps round-trip

    def __post_init__(self) -> None:
        if not isfinite(self.bps_per_side) or self.bps_per_side < 0:
            raise ValueError("transaction cost assumption must be finite and nonnegative")

    def cost(self, turnover: float) -> float:
        """Cost as a fraction of portfolio value for a given ``turnover`` (Σ|Δweight|)."""
        if not isfinite(turnover) or turnover < 0:
            raise ValueError("turnover must be finite and nonnegative")
        result = turnover * (self.bps_per_side / 10_000.0)
        if not isfinite(result):
            raise ValueError("transaction cost calculation overflow")
        return result

    def describe(self) -> dict[str, float]:
        """Auditable summary of the cost assumptions (recorded with every backtest)."""
        return {"bps_per_side": self.bps_per_side}
