"""Trial ledger: append-only, hash-chained, tamper-evident, multiplicity counting."""

from __future__ import annotations

import datetime as dt
import unittest

from atlas.common.errors import LedgerIntegrityError
from atlas.common.time_utils import UTC
from atlas.common.types import TrialStatus
from atlas.trials import InMemoryLedgerStore, TrialLedger, TrialRecord


def _rec(trial: str, family: str, status: TrialStatus, day: int = 1) -> TrialRecord:
    return TrialRecord(
        trial_id=trial, family_id=family, status=status,
        recorded_at=dt.datetime(2024, 3, day, 12, 0, tzinfo=UTC),
        spec={"family": family, "params": {"n": 10}}, seed=42,
    )


class TestTrialLedger(unittest.TestCase):
    def test_append_and_verify(self) -> None:
        ledger = TrialLedger()
        ledger.append(_rec("t1", "momentum", TrialStatus.PROPOSED))
        ledger.append(_rec("t1", "momentum", TrialStatus.COMPLETED, day=2))
        ledger.verify_integrity()  # should not raise
        self.assertEqual(len(ledger.entries()), 2)

    def test_latest_state_wins(self) -> None:
        ledger = TrialLedger()
        ledger.append(_rec("t1", "f", TrialStatus.PROPOSED))
        ledger.append(_rec("t1", "f", TrialStatus.REJECTED, day=2))
        self.assertEqual(ledger.latest_per_trial()["t1"].status, TrialStatus.REJECTED)

    def test_multiplicity_counts_distinct_trials_per_family(self) -> None:
        ledger = TrialLedger()
        for i in range(5):  # a parameter search: 5 trials in one family
            ledger.append(_rec(f"t{i}", "meanrev", TrialStatus.COMPLETED))
        ledger.append(_rec("x0", "other", TrialStatus.COMPLETED))
        self.assertEqual(ledger.family_trial_count("meanrev"), 5)
        self.assertEqual(ledger.family_trial_count("other"), 1)

    def test_summary(self) -> None:
        ledger = TrialLedger()
        ledger.append(_rec("a", "f", TrialStatus.REJECTED))
        ledger.append(_rec("b", "f", TrialStatus.PROMOTED))
        ledger.append(_rec("c", "f", TrialStatus.FAILED))
        s = ledger.summary()
        self.assertEqual(s["total_trials"], 3)
        self.assertEqual(s["rejected"], 1)
        self.assertEqual(s["promoted"], 1)
        self.assertEqual(s["failed"], 1)

    def test_tampering_is_detected(self) -> None:
        store = InMemoryLedgerStore()
        ledger = TrialLedger(store)
        ledger.append(_rec("t1", "f", TrialStatus.PROPOSED))
        ledger.append(_rec("t2", "f", TrialStatus.PROPOSED, day=2))
        # Silently rewrite history: flip the first record's status.
        store._entries[0]["record"]["status"] = TrialStatus.PROMOTED.value
        with self.assertRaises(LedgerIntegrityError):
            ledger.verify_integrity()

    def test_naive_recorded_at_rejected(self) -> None:
        ledger = TrialLedger()
        bad = TrialRecord("t", "f", TrialStatus.PROPOSED, dt.datetime(2024, 3, 1, 12, 0))
        with self.assertRaises(Exception):
            ledger.append(bad)


if __name__ == "__main__":
    unittest.main()
