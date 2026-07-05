"""Atlas — the trustworthy market-data foundation for the Jarvis quantitative division.

Phase 2 delivers Atlas's *source of truth*: a bitemporal, point-in-time-correct,
reproducible, quality-gated market-data layer. See docs/data/ and ADRs 0010-0014.

Architectural note: the domain *core* (``atlas.common``, ``atlas.data.bitemporal``,
``atlas.data.quality``, ``atlas.data.calendars``, ``atlas.data.adjustments``,
``atlas.data.universe``, ``atlas.data.snapshots``, ``atlas.data.lineage`` and
``atlas.trials``) is **pure standard library** — zero third-party imports — so it is
trivially testable and reproducible. Heavy dependencies (SQLAlchemy, Pydantic, pandas)
live only in adapter layers (``atlas.data.models``, ``atlas.data.ingestion.adapters``,
``atlas.config``, ``atlas.cli``), honouring the loose-coupling mandate of ADR 0002.
"""

from __future__ import annotations

__version__ = "0.2.0"
__all__ = ["__version__"]
