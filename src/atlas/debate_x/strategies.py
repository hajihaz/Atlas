"""Strategies Debate X can review.

Debate X is a filter *around* Atlas strategies; it never replaces or modifies them.
ScalpStorm X is the flagship; the five approved intraday research strategies remain
first-class. IDs match ``frontend/lib/research-engine.js`` and the ScalpStorm X
09:40 paper desk.
"""

from __future__ import annotations

FLAGSHIP_STRATEGY_ID = "scalpstorm_x_0940"

APPROVED_STRATEGIES: dict[str, str] = {
    FLAGSHIP_STRATEGY_ID: "ScalpStorm X",
    "sma_9_21": "SMA 9/21 Crossover",
    "ema_12_26": "EMA 12/26 Momentum",
    "rsi_14": "RSI 14 Mean Reversion",
    "breakout_20": "20-Bar Breakout",
    "sps_pullback": "SPS Swing Pullback",
}


def is_approved_strategy(strategy_id: object) -> bool:
    """Informational: whether the ID belongs to the approved multi-strategy set."""
    return isinstance(strategy_id, str) and strategy_id in APPROVED_STRATEGIES
