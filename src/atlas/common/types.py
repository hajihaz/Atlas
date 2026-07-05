"""Shared enumerations — the ubiquitous language of the data layer (domain-model.md)."""

from __future__ import annotations

from enum import Enum, IntEnum


class Severity(IntEnum):
    """Data-quality finding severity. Ordered so comparisons express escalation.

    ``ERROR`` and ``CRITICAL`` are *halting*: a fail-safe system stops using data that
    trips them rather than trading on it (ADR 0008 / ADR 0013).
    """

    INFO = 10
    WARNING = 20
    ERROR = 30
    CRITICAL = 40

    @property
    def halts(self) -> bool:
        """Whether a finding of this severity blocks downstream use."""
        return self >= Severity.ERROR


class InstrumentType(str, Enum):
    EQUITY = "equity"
    INDEX = "index"
    VOLATILITY_INDEX = "volatility_index"  # India VIX


class IndexCode(str, Enum):
    """Indices Atlas tracks in Phase 2 (NSE)."""

    NIFTY_50 = "NIFTY_50"
    NIFTY_100 = "NIFTY_100"
    NIFTY_200 = "NIFTY_200"

    @property
    def expected_size(self) -> int:
        return {"NIFTY_50": 50, "NIFTY_100": 100, "NIFTY_200": 200}[self.value]


class CorporateActionType(str, Enum):
    SPLIT = "split"                    # stock split (face-value division)
    BONUS = "bonus"                    # bonus issue
    DIVIDEND = "dividend"              # cash dividend
    RIGHTS = "rights"                  # rights issue
    MERGER = "merger"
    DEMERGER = "demerger"
    FACE_VALUE_CHANGE = "face_value_change"
    SYMBOL_CHANGE = "symbol_change"
    ISIN_CHANGE = "isin_change"
    DELISTING = "delisting"


class TrialStatus(str, Enum):
    """Lifecycle of a research trial (trial-ledger.md). Every experiment lands here."""

    PROPOSED = "proposed"
    RUNNING = "running"
    FAILED = "failed"        # errored / did not complete
    COMPLETED = "completed"  # ran, produced metrics
    REJECTED = "rejected"    # failed an evidence gate
    PROMOTED = "promoted"    # advanced toward production
    ARCHIVED = "archived"


class MembershipEvent(str, Enum):
    ADDED = "added"
    REMOVED = "removed"
