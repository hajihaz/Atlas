"""Regression tests for the Phase-2 adversarial-review hardening.

Each test pins a specific reviewer finding so it cannot silently regress.
"""

from __future__ import annotations

import datetime as dt
import unittest
from decimal import Decimal

from atlas.common.errors import (
    AtlasError,
    LedgerIntegrityError,
    PointInTimeViolation,
)
from atlas.common.ids import snapshot_id
from atlas.common.time_utils import FAR_FUTURE, IST, UTC, session_close_utc
from atlas.common.types import CorporateActionType, Severity, TrialStatus
from atlas.data.adjustments import CorporateAction, price_factor
from atlas.data.bitemporal import BitemporalStore, BitemporalVersion, verify_contiguity
from atlas.data.calendars import NSE
from atlas.data.market.records import OHLCVBar
from atlas.data.quality import DataBatch, default_suite
from atlas.data.quality.checks import Check
from atlas.data.quality.framework import Finding, ValidationSuite
from atlas.data.universe import UniverseLog
from atlas.trials import InMemoryLedgerStore, TrialLedger, TrialRecord


def _t(day: int, hour: int = 10) -> dt.datetime:
    return dt.datetime(2024, 3, day, hour, 0, tzinfo=UTC)


class TestAsOfBoundary(unittest.TestCase):
    def test_as_of_far_future_rejected(self) -> None:
        """Querying AT the open-interval sentinel must not silently return an empty world."""
        store = BitemporalStore()
        store.record(key="k", knowledge_time=_t(16), payload={"v": 1}, source="s")
        with self.assertRaises(PointInTimeViolation):
            store.as_of("k", FAR_FUTURE)


class TestContiguity(unittest.TestCase):
    def test_gap_is_detected(self) -> None:
        # Two versions of the same key with a hole between them -> as-of in the hole would
        # wrongly resolve to "absent". verify_contiguity must catch it.
        v1 = BitemporalVersion("k", _t(16), _t(18), {"v": 1}, "s")
        v2 = BitemporalVersion("k", _t(20), FAR_FUTURE, {"v": 2}, "s", revision=1)  # gap 18->20
        with self.assertRaises(PointInTimeViolation):
            verify_contiguity([v1, v2])

    def test_contiguous_chain_ok(self) -> None:
        store = BitemporalStore()
        store.record(key="k", knowledge_time=_t(16), payload={"v": 1}, source="s")
        store.record(key="k", knowledge_time=_t(18), payload={"v": 2}, source="s")
        store.verify_contiguity()  # must not raise


class TestRightsFailsClosed(unittest.TestCase):
    def test_rights_raises_not_silent(self) -> None:
        ca = CorporateAction("i", CorporateActionType.RIGHTS, dt.date(2024, 3, 15),
                             {"ratio": "1:5", "price": "50"})
        with self.assertRaises(NotImplementedError):
            price_factor(ca)


class TestSnapshotIdIncludesCode(unittest.TestCase):
    def test_code_version_changes_id(self) -> None:
        a = snapshot_id("2024-03-16T00:00:00+00:00", {"x": 1}, "digest", "codeA")
        b = snapshot_id("2024-03-16T00:00:00+00:00", {"x": 1}, "digest", "codeB")
        self.assertNotEqual(a, b)


class TestSessionCloseUtc(unittest.TestCase):
    def test_close_is_1000z(self) -> None:
        # 15:30 IST == 10:00 UTC (IST has no DST). Pins the tzdata assumption.
        close = session_close_utc(dt.date(2024, 3, 15))
        self.assertEqual(close, dt.datetime(2024, 3, 15, 10, 0, tzinfo=UTC))
        self.assertEqual(close.astimezone(IST).time(), dt.time(15, 30))


class TestBoundedPriceInput(unittest.TestCase):
    def test_absurd_price_rejected(self) -> None:
        with self.assertRaises(AtlasError):
            OHLCVBar("i", dt.date(2024, 3, 15), "1E1000000000", "1", "1", "1", 1, "s")

    def test_absurd_volume_rejected(self) -> None:
        with self.assertRaises(AtlasError):
            OHLCVBar("i", dt.date(2024, 3, 15), "1", "1", "1", "1", "9" * 40, "s")


class TestErroredCheckHalts(unittest.TestCase):
    def test_check_exception_becomes_critical(self) -> None:
        class Boom(Check):
            name = "boom"

            def run(self, batch: DataBatch) -> list[Finding]:
                raise RuntimeError("kaboom")

        report = ValidationSuite([Boom()]).validate(DataBatch(bars=[]))
        self.assertTrue(report.halted)
        self.assertEqual(report.max_severity, Severity.CRITICAL)


class TestNewGateChecks(unittest.TestCase):
    def _bar(self, day: int) -> OHLCVBar:
        return OHLCVBar("i", dt.date(2024, 3, day), "100", "110", "90", "105", 1000, "s")

    def test_calendar_coverage_halts_outside_range(self) -> None:
        # NSE seed covers 2024-2025; a 2026 range must HALT, not silently trust weekday.
        batch = DataBatch(bars=[], calendar=NSE,
                          date_range=(dt.date(2026, 1, 5), dt.date(2026, 1, 6)))
        self.assertTrue(default_suite().validate(batch).halted)

    def test_freshness_halts_on_stale_feed(self) -> None:
        batch = DataBatch(bars=[self._bar(1)], as_of_date=dt.date(2024, 3, 31), max_stale_days=5)
        self.assertTrue(default_suite().validate(batch).halted)

    def test_dropped_instrument_halts(self) -> None:
        batch = DataBatch(bars=[self._bar(15)], expected_instruments=frozenset({"i", "j"}))
        report = default_suite().validate(batch)
        self.assertTrue(report.halted)  # "j" returned no data


class TestMembershipRejoin(unittest.TestCase):
    def test_leave_then_rejoin(self) -> None:
        log = UniverseLog()
        # In 2020-2021, out 2021-2023, back in from 2023 (each learned when it happened).
        log.add_membership(index="NIFTY_50", instrument_id="A", valid_from=dt.date(2020, 1, 1),
                           valid_to=dt.date(2021, 6, 1),
                           knowledge_time=dt.datetime(2020, 1, 1, tzinfo=UTC), source="idx")
        log.add_membership(index="NIFTY_50", instrument_id="A", valid_from=dt.date(2023, 1, 1),
                           knowledge_time=dt.datetime(2023, 1, 1, tzinfo=UTC), source="idx")
        k = dt.datetime(2024, 1, 1, tzinfo=UTC)
        self.assertIn("A", log.constituents(index="NIFTY_50", event_date=dt.date(2020, 6, 1),
                                            known_as_of=k))
        self.assertNotIn("A", log.constituents(index="NIFTY_50", event_date=dt.date(2022, 6, 1),
                                               known_as_of=k))  # the gap
        self.assertIn("A", log.constituents(index="NIFTY_50", event_date=dt.date(2023, 6, 1),
                                            known_as_of=k))


class TestLedgerTruncationDetection(unittest.TestCase):
    def _rec(self, tid: str) -> TrialRecord:
        return TrialRecord(tid, "f", TrialStatus.COMPLETED, _t(16))

    def test_checkpoint_detects_truncation(self) -> None:
        store = InMemoryLedgerStore()
        ledger = TrialLedger(store)
        ledger.append(self._rec("t0"))
        ledger.append(self._rec("t1"))
        ledger.append(self._rec("t2"))
        checkpoint = ledger.head_checkpoint()  # (seq=2, chain_hash)
        # Attacker truncates the last two entries — the prefix still self-verifies...
        del store._entries[1:]
        ledger.verify_integrity()  # self-check passes (this is the weakness)
        # ...but the external checkpoint catches the truncation.
        with self.assertRaises(LedgerIntegrityError):
            ledger.verify_integrity(checkpoint=checkpoint)


if __name__ == "__main__":
    unittest.main()
