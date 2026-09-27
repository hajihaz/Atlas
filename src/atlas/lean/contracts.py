"""Canonical Atlas -> LEAN simulation decision contract.

The contract intentionally carries a target portfolio, not orders. LEAN is a
subordinate simulator; Atlas remains responsible for strategy identity,
evidence, and authorization.
"""

from __future__ import annotations

import datetime as _dt
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from atlas.common.hashing import content_hash


@dataclass(frozen=True)
class LeanDecision:
    """One instrument target at one Atlas decision date."""

    instrument_id: str
    target_weight: Decimal


@dataclass(frozen=True)
class LeanDecisionEnvelope:
    """Immutable, content-addressed decision passed from Atlas to LEAN.

    ``decision_date`` is when Atlas made the decision. ``effective_date`` must
    be later, preserving the reference engine's explicit one-session lag.
    No broker identifiers, credentials, order types, prices, or quantities are
    represented here by design.
    """

    strategy_config_id: str
    strategy_name: str
    strategy_version: str
    decision_date: _dt.date
    effective_date: _dt.date
    decisions: tuple[LeanDecision, ...]
    snapshot_id: str
    evidence_hash: str
    execution_model: str = "next_session_close_to_close"

    def __post_init__(self) -> None:
        if self.effective_date <= self.decision_date:
            raise ValueError("effective_date must be strictly after decision_date")
        if not self.strategy_config_id or not self.snapshot_id or not self.evidence_hash:
            raise ValueError("strategy, snapshot, and evidence identities are required")
        instruments = [d.instrument_id for d in self.decisions]
        if any(not iid for iid in instruments):
            raise ValueError("instrument_id cannot be empty")
        if len(instruments) != len(set(instruments)):
            raise ValueError("each instrument may appear only once")
        if any(not d.target_weight.is_finite() for d in self.decisions):
            raise ValueError("target weights must be finite")

    def payload(self) -> dict[str, Any]:
        """Canonical, JSON-hashable payload with deterministic ordering."""
        return {
            "contract": "atlas.lean.decision.v1",
            "strategy_config_id": self.strategy_config_id,
            "strategy_name": self.strategy_name,
            "strategy_version": self.strategy_version,
            "decision_date": self.decision_date.isoformat(),
            "effective_date": self.effective_date.isoformat(),
            "execution_model": self.execution_model,
            "snapshot_id": self.snapshot_id,
            "evidence_hash": self.evidence_hash,
            "decisions": [
                {"instrument_id": d.instrument_id, "target_weight": f"{d.target_weight:f}"}
                for d in sorted(self.decisions, key=lambda x: x.instrument_id)
            ],
        }

    def envelope_hash(self) -> str:
        """Stable SHA-256 identity of the exact decision sent to LEAN."""
        return content_hash(self.payload())

    def target_weights(self) -> Mapping[str, Decimal]:
        """Return only the portfolio targets LEAN is permitted to consume."""
        return {d.instrument_id: d.target_weight for d in self.decisions}
