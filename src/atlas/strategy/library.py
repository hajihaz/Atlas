"""Reference strategies — for EXERCISING the engine, not for deployment.

None of these is validated alpha. They are deliberately simple, transparent constructs used
by tests, demos, and comparison baselines. Real strategies arrive through the research
funnel and must clear the evidence gates ([research.gates]) before they mean anything.
"""

from __future__ import annotations

from statistics import fmean

from atlas.research.dataview import DataView
from atlas.strategy.base import Strategy, StrategySpec


class BuyAndHold(Strategy):
    """Equal-weight, always-invested benchmark across the whole universe."""

    def __init__(self, version: str = "1") -> None:
        super().__init__(StrategySpec("buy_and_hold", version))

    def target_weights(self, view: DataView) -> dict[str, float]:
        instruments = view.instruments()
        if not instruments:
            return {}
        w = 1.0 / len(instruments)
        return {iid: w for iid in instruments}


class SmaCrossover(Strategy):
    """Long-only SMA crossover: hold an instrument when its fast SMA exceeds its slow SMA.

    Params: ``fast`` (int), ``slow`` (int). Long-only, equal weight across held names.
    """

    def __init__(self, fast: int, slow: int, version: str = "1") -> None:
        if fast >= slow:
            raise ValueError("fast window must be shorter than slow window")
        super().__init__(StrategySpec("sma_crossover", version, {"fast": fast, "slow": slow}))
        self.fast, self.slow = fast, slow

    def target_weights(self, view: DataView) -> dict[str, float]:
        held: list[str] = []
        for iid in view.instruments():
            closes = [float(c) for c in view.closes(iid, lookback=self.slow)]
            if len(closes) < self.slow:
                continue
            if fmean(closes[-self.fast :]) > fmean(closes):
                held.append(iid)
        if not held:
            return {}
        w = 1.0 / len(held)
        return {iid: w for iid in held}


class CrossSectionalMomentum(Strategy):
    """Long the top-``k`` instruments by trailing ``lookback``-session return, equal weight."""

    def __init__(self, lookback: int, top_k: int, version: str = "1") -> None:
        super().__init__(
            StrategySpec("xs_momentum", version, {"lookback": lookback, "top_k": top_k})
        )
        self.lookback, self.top_k = lookback, top_k

    def target_weights(self, view: DataView) -> dict[str, float]:
        scores: list[tuple[float, str]] = []
        for iid in view.instruments():
            closes = [float(c) for c in view.closes(iid, lookback=self.lookback + 1)]
            if len(closes) < self.lookback + 1 or closes[-self.lookback - 1] == 0:
                continue
            scores.append((closes[-1] / closes[-self.lookback - 1] - 1.0, iid))
        if not scores:
            return {}
        scores.sort(reverse=True)
        winners = [iid for _, iid in scores[: self.top_k]]
        w = 1.0 / len(winners)
        return {iid: w for iid in winners}
