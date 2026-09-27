"""Atlas error hierarchy.

Errors are deliberately specific: the *type* of failure drives the fail-safe response
(halt vs. reject vs. quarantine). See docs/data/data-quality.md and the automated-trading
charter's fail-safe defaults (ADR 0008) — on ambiguity, Atlas stops, it does not guess.
"""

from __future__ import annotations


class AtlasError(Exception):
    """Base class for all Atlas errors."""


class PointInTimeViolation(AtlasError, ValueError):
    """A query or record would leak information not knowable at the stated time.

    Raised on look-ahead attempts, naive (tz-unaware) datetimes, or knowledge-time
    ordering violations. This is the single most important safety error in the data
    layer — it is how Atlas refuses to lie to itself (ADR 0005).
    """


class DataQualityHalt(AtlasError):
    """A critical data-quality gate failed; downstream use is halted (fail-safe).

    Carries the failing :class:`~atlas.data.quality.framework.ValidationReport` so the
    caller and the audit trail can see exactly what failed and why.
    """

    def __init__(self, message: str, report: object | None = None) -> None:
        super().__init__(message)
        self.report = report


class ReproducibilityError(AtlasError):
    """A result could not be reproduced, or provenance is missing/inconsistent."""


class LedgerIntegrityError(AtlasError):
    """The trial ledger (or another hash-chained log) failed integrity verification.

    Indicates a broken or tampered hash chain — a terminal integrity failure (F-B4).
    """


class ConfigurationError(AtlasError):
    """Invalid or missing configuration."""
