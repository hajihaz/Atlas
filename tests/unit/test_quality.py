"""Data-quality checks and the fail-safe gate."""

from __future__ import annotations

import datetime as dt
import unittest
from decimal import Decimal

from atlas.common.errors import DataQualityHalt
from atlas.common.types import Severity
from atlas.data.calendars import TradingCalendar
from atlas.data.market.records import OHLCVBar
from atlas.data.quality import DataBatch, default_suite
from atlas.data.quality.checks import (
    CrossSourceDisagreementCheck,
    MissingSessionCheck,
    PriceJumpCheck,
    UniverseSizeCheck,
)
from atlas.data.quality.framework import ValidationSuite


def _bar(sym: str = "i", day: int = 15, o="100", h="110", low="90", c="105", v=1000) -> OHLCVBar:
    return OHLCVBar(sym, dt.date(2024, 3, day), o, h, low, c, v, "src")


class TestQualityChecks(unittest.TestCase):
    def test_clean_batch_passes(self) -> None:
        report = default_suite().validate(DataBatch(bars=[_bar()]))
        self.assertTrue(report.ok)
        self.assertFalse(report.halted)

    def test_bad_ohlc_halts(self) -> None:
        bad = _bar(h="80", low="90")  # high < low
        report = default_suite().validate(DataBatch(bars=[bad]))
        self.assertTrue(report.halted)
        self.assertEqual(report.max_severity, Severity.ERROR)

    def test_duplicate_halts(self) -> None:
        report = default_suite().validate(DataBatch(bars=[_bar(), _bar()]))
        self.assertTrue(report.halted)

    def test_future_date_is_critical(self) -> None:
        report = default_suite().validate(
            DataBatch(bars=[_bar(day=20)], as_of_date=dt.date(2024, 3, 15))
        )
        self.assertTrue(report.halted)
        self.assertEqual(report.max_severity, Severity.CRITICAL)

    def test_non_session_date_halts(self) -> None:
        cal = TradingCalendar("T", frozenset())
        report = default_suite().validate(DataBatch(bars=[_bar(day=16)], calendar=cal))  # Saturday
        self.assertTrue(report.halted)

    def test_missing_session_flagged(self) -> None:
        cal = TradingCalendar("T", frozenset())
        # Instrument has a bar on Fri 15 but not Thu 14; expect a gap for the 14th.
        batch = DataBatch(bars=[_bar(day=15)], calendar=cal,
                          date_range=(dt.date(2024, 3, 14), dt.date(2024, 3, 15)))
        findings = MissingSessionCheck().run(batch)
        self.assertTrue(findings and findings[0].severity == Severity.ERROR)

    def test_price_jump_explained_vs_unexplained(self) -> None:
        prior = {"i": Decimal("100")}
        jump_bar = _bar(o="50", h="55", low="45", c="50")  # ~50% down vs prior 100
        unexplained = PriceJumpCheck().run(DataBatch(bars=[jump_bar], prior_close=prior))
        self.assertEqual(unexplained[0].severity, Severity.ERROR)
        explained = PriceJumpCheck().run(
            DataBatch(bars=[jump_bar], prior_close=prior,
                      ex_dates={"i": {dt.date(2024, 3, 15)}})
        )
        self.assertEqual(explained[0].severity, Severity.INFO)

    def test_cross_source_disagreement_halts(self) -> None:
        findings = CrossSourceDisagreementCheck().run(
            DataBatch(bars=[_bar(c="105")],
                      cross_source_close={("i", dt.date(2024, 3, 15)): Decimal("120")})
        )
        self.assertEqual(findings[0].severity, Severity.ERROR)

    def test_universe_drift_flagged(self) -> None:
        findings = UniverseSizeCheck().run(DataBatch(bars=[], index_observed={"NIFTY_50": (49, 50)}))
        self.assertEqual(findings[0].severity, Severity.ERROR)


class TestGate(unittest.TestCase):
    def test_gate_raises_on_halt(self) -> None:
        suite = default_suite()
        with self.assertRaises(DataQualityHalt):
            suite.gate(DataBatch(bars=[_bar(h="80", low="90")]))

    def test_gate_passes_clean(self) -> None:
        report = default_suite().gate(DataBatch(bars=[_bar()]))
        self.assertTrue(report.ok)

    def test_report_digest_is_deterministic(self) -> None:
        b = DataBatch(bars=[_bar(h="80", low="90")])
        self.assertEqual(default_suite().validate(b).digest(),
                         default_suite().validate(b).digest())

    def test_empty_suite_is_ok(self) -> None:
        self.assertTrue(ValidationSuite([]).validate(DataBatch(bars=[_bar()])).ok)


if __name__ == "__main__":
    unittest.main()
