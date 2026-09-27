"""The Atlas Trial Ledger (ADR 0012 / trial-ledger.md).

Every research experiment — every parameter search, every optimization attempt — is
recorded here, append-only and hash-chained. This is what lets Atlas answer honestly how
many ideas were tested, which failed, which survived, and which reached production, and it
supplies the *family-level trial count* that the multiple-testing correction consumes
(ADR 0005). Nothing generates trials yet (strategies are Phase 3+); Phase 2 builds the
tamper-evident ledger they will write to.
"""

from __future__ import annotations

from atlas.trials.ledger import LedgerEntry, TrialLedger, TrialRecord
from atlas.trials.store import InMemoryLedgerStore, JsonlLedgerStore, LedgerStore

__all__ = [
    "InMemoryLedgerStore",
    "JsonlLedgerStore",
    "LedgerEntry",
    "LedgerStore",
    "TrialLedger",
    "TrialRecord",
]
