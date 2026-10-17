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


@dataclass(frozen=True)
class AdverseMarketCostModel(CostModel):
    """Conservative historical-stress assumptions, not observed market liquidity.

    The three independent nonnegative shock components remain auditable in
    backtest metadata; they never reduce baseline transaction costs.
    """

    spread_bps_per_side: float = 5.0
    gap_bps_per_side: float = 20.0
    liquidity_impact_bps_per_side: float = 15.0

    def __post_init__(self) -> None:
        super().__post_init__()
        shocks = (
            self.spread_bps_per_side,
            self.gap_bps_per_side,
            self.liquidity_impact_bps_per_side,
        )
        if any(not isfinite(item) or item < 0 for item in shocks):
            raise ValueError("adverse-market shock assumptions must be finite and nonnegative")
        if not isfinite(sum(shocks) + self.bps_per_side):
            raise ValueError("adverse-market total cost overflow")

    def cost(self, turnover: float) -> float:
        baseline = super().cost(turnover)
        stress = turnover * (
            (self.spread_bps_per_side + self.gap_bps_per_side + self.liquidity_impact_bps_per_side)
            / 10_000.0
        )
        result = baseline + stress
        if not isfinite(result):
            raise ValueError("adverse-market cost calculation overflow")
        return result

    def describe(self) -> dict[str, float]:
        return {
            **super().describe(),
            "spread_bps_per_side": self.spread_bps_per_side,
            "gap_bps_per_side": self.gap_bps_per_side,
            "liquidity_impact_bps_per_side": self.liquidity_impact_bps_per_side,
        }
