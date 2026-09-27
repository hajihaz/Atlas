"""Strategy specifications and a small reference library (Phase 3).

A *strategy* is a versioned specification that, given a leak-proof :class:`DataView` at a
decision date, produces target portfolio weights. Strategies see only past data (ADR 0017).

The library strategies (buy-and-hold, SMA crossover, momentum) exist to **exercise the
engine** — they are reference/test constructs, NOT validated alpha, and are labelled as such.
"""

from __future__ import annotations

from atlas.strategy.base import Strategy, StrategySpec
from atlas.strategy.library import BuyAndHold, CrossSectionalMomentum, SmaCrossover

__all__ = ["BuyAndHold", "CrossSectionalMomentum", "SmaCrossover", "Strategy", "StrategySpec"]
