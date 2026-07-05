"""Data-quality validation framework and checks (ADR 0013).

Fail-safe by construction: a report containing any ERROR/CRITICAL finding *halts*
downstream use. Bad or stale data is quarantined, never silently trusted.
"""

from __future__ import annotations

from atlas.data.quality.checks import default_suite
from atlas.data.quality.framework import (
    Check,
    DataBatch,
    Finding,
    ValidationReport,
    ValidationSuite,
)

__all__ = [
    "Check",
    "DataBatch",
    "Finding",
    "ValidationReport",
    "ValidationSuite",
    "default_suite",
]
