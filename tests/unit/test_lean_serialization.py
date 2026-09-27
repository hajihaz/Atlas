"""Golden serialization fixture for the Atlas -> LEAN boundary."""

from __future__ import annotations

import datetime as dt
import json
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from atlas.lean import LeanDecision, LeanDecisionEnvelope
from atlas.lean.serialization import write_envelope


class TestLeanSerialization(unittest.TestCase):
    def test_serialization_is_canonical_and_round_trippable(self):
        envelope = LeanDecisionEnvelope(
            strategy_config_id="cfg_golden_001",
            strategy_name="golden_target_weights",
            strategy_version="1.0.0",
            decision_date=dt.date(2025, 1, 2),
            effective_date=dt.date(2025, 1, 3),
            decisions=(
                LeanDecision("NSE:BBB", Decimal("-0.125")),
                LeanDecision("NSE:AAA", Decimal("0.625")),
            ),
            snapshot_id="snap_golden_001",
            evidence_hash="evidence_golden_001",
        )
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "decision.json"
            write_envelope(envelope, path)
            payload = json.loads(path.read_text(encoding="utf-8"))

        self.assertEqual(payload["contract"], "atlas.lean.decision.v1")
        self.assertEqual(payload["effective_date"], "2025-01-03")
        self.assertEqual(
            payload["decisions"],
            [
                {"instrument_id": "NSE:AAA", "target_weight": "0.625"},
                {"instrument_id": "NSE:BBB", "target_weight": "-0.125"},
            ],
        )
        self.assertEqual(
            envelope.envelope_hash(),
            __import__("atlas.common.hashing", fromlist=["content_hash"]).content_hash(payload),
        )


if __name__ == "__main__":
    unittest.main()
