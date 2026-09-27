"""Safety and determinism tests for the Atlas -> LEAN boundary."""

from __future__ import annotations

import datetime as dt
import unittest
from decimal import Decimal

from atlas.lean import LeanDecision, LeanDecisionEnvelope


class TestLeanDecisionEnvelope(unittest.TestCase):
    def _envelope(self, decisions=None):
        return LeanDecisionEnvelope(
            strategy_config_id="cfg_probe",
            strategy_name="probe",
            strategy_version="1",
            decision_date=dt.date(2025, 1, 2),
            effective_date=dt.date(2025, 1, 3),
            decisions=tuple(
                decisions
                or (
                    LeanDecision("B", Decimal("-0.25")),
                    LeanDecision("A", Decimal("1.25")),
                )
            ),
            snapshot_id="snap_probe",
            evidence_hash="evidence_probe",
        )

    def test_payload_orders_instruments_deterministically(self):
        env = self._envelope()
        self.assertEqual([x["instrument_id"] for x in env.payload()["decisions"]], ["A", "B"])

    def test_equivalent_input_order_has_same_hash(self):
        a = self._envelope()
        b = self._envelope(tuple(reversed(a.decisions)))
        self.assertEqual(a.envelope_hash(), b.envelope_hash())

    def test_decision_must_be_before_effective_date(self):
        with self.assertRaises(ValueError):
            LeanDecisionEnvelope(
                strategy_config_id="c",
                strategy_name="s",
                strategy_version="1",
                decision_date=dt.date(2025, 1, 3),
                effective_date=dt.date(2025, 1, 3),
                decisions=(),
                snapshot_id="snap",
                evidence_hash="evidence",
            )

    def test_duplicate_instruments_are_rejected(self):
        with self.assertRaises(ValueError):
            self._envelope((LeanDecision("A", Decimal("1")), LeanDecision("A", Decimal("0"))))

    def test_non_finite_weight_is_rejected(self):
        with self.assertRaises(ValueError):
            self._envelope((LeanDecision("A", Decimal("NaN")),))

    def test_contract_contains_no_order_or_broker_authority(self):
        keys = set(self._envelope().payload())
        self.assertFalse(keys & {"order_id", "broker", "brokerage", "api_key", "quantity", "price"})
        self.assertEqual(self._envelope().execution_model, "next_session_close_to_close")


if __name__ == "__main__":
    unittest.main()
