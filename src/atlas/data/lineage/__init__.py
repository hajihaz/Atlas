"""Data lineage / provenance — answering "where did this come from?" (ADR 0014)."""

from __future__ import annotations

from atlas.data.lineage.provenance import Provenance, stamp

__all__ = ["Provenance", "stamp"]
