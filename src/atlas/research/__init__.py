"""Atlas research layer (Phase 3): leak-proof data access, experiments, evidence gates.

The research layer sits on the Phase-2 data foundation and feeds the backtesting engine.
Its defining responsibility is **leakage prevention**: a strategy may only ever see data
that was knowable at its decision time. See docs/research/research-workflow.md and ADR 0017.

Pure standard library — deterministic and testable with zero third-party deps.
"""

from __future__ import annotations

# Only the LOW-level DataView is exported at the package top level. The high-level
# orchestrators (experiment, gates) depend on atlas.backtest, which in turn depends on
# research.dataview — so importing them here would create a cycle. Import them from their
# submodules: `from atlas.research.experiment import run_experiment`.
from atlas.research.dataview import BarSource, DataView, InMemoryBarSource

__all__ = ["BarSource", "DataView", "InMemoryBarSource"]
