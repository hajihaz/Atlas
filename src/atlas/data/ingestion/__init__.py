"""Vendor-agnostic ingestion (ADR 0010).

Every vendor sits behind a :class:`VendorAdapter` that returns **normalized** bars, so the
pipeline and everything downstream is identical regardless of source — the Phase-2 exit
criterion "swap any vendor behind the abstraction without downstream changes" (roadmap).
The pipeline is pure, deterministic, idempotent, provenance-stamped, and **fail-safe**:
data that trips a halting quality finding is never loaded.
"""

from __future__ import annotations

from atlas.data.ingestion.adapter import FetchRequest, VendorAdapter
from atlas.data.ingestion.pipeline import IngestionResult, ingest

__all__ = ["FetchRequest", "IngestionResult", "VendorAdapter", "ingest"]
