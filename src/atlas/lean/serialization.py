"""Stable serialization for the Atlas -> LEAN decision envelope."""

from __future__ import annotations

import json
from pathlib import Path

from atlas.lean.contracts import LeanDecisionEnvelope


def write_envelope(envelope: LeanDecisionEnvelope, path: str | Path) -> None:
    """Write the canonical envelope for a subordinate LEAN process."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(envelope.payload(), sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
