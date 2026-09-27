"""SQLAlchemy persistence models — the production schema (ADR 0011).

This is an **adapter layer**: it depends on SQLAlchemy and targets PostgreSQL. The domain
core does not import it. The schema is the physical realization of the bitemporal design
proven by the pure ``atlas.data.bitemporal`` reference semantics; the reproducibility
tests assert the two agree. See docs/data/data-architecture.md for the full ER model.
"""

from __future__ import annotations

from atlas.data.models.base import Base, metadata
from atlas.data.models.tables import (
    CorporateActionRow,
    DataQualityFinding,
    IndexMembershipRow,
    IngestionRun,
    InstrumentRow,
    OHLCVObservation,
    SnapshotRow,
    SourceRow,
    TradingHoliday,
    TrialLedgerRow,
)

__all__ = [
    "Base",
    "CorporateActionRow",
    "DataQualityFinding",
    "IndexMembershipRow",
    "IngestionRun",
    "InstrumentRow",
    "OHLCVObservation",
    "SnapshotRow",
    "SourceRow",
    "TradingHoliday",
    "TrialLedgerRow",
    "metadata",
]
