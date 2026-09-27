import unittest
from decimal import Decimal

from atlas.reporting.paper import build_paper_report


class PaperReportingTests(unittest.TestCase):
    def test_report_contains_return_drawdown_and_sharpe(self):
        report = build_paper_report([Decimal("100"), Decimal("110"), Decimal("99"), Decimal("108")])
        self.assertEqual(report.observations, 4)
        self.assertEqual(report.start_equity, Decimal("100"))
        self.assertEqual(report.end_equity, Decimal("108"))
        self.assertEqual(report.total_return, Decimal("0.08"))
        self.assertEqual(report.max_drawdown, Decimal("0.10"))
        self.assertTrue(report.sharpe != 0)

    def test_invalid_observations_fail_closed(self):
        with self.assertRaises(ValueError):
            build_paper_report([])
        with self.assertRaises(ValueError):
            build_paper_report([Decimal("100"), Decimal("0")])
        with self.assertRaises(ValueError):
            build_paper_report([Decimal("100")], reconciliation_failures=-1)


if __name__ == "__main__":
    unittest.main()


class ExtendedPaperReportingTests(unittest.TestCase):
    def test_operational_metrics_are_preserved(self):
        report = build_paper_report(
            [Decimal("100"), Decimal("101")],
            turnover=Decimal("0.5"),
            fees=Decimal("2.5"),
            fills=3,
            rejected_orders=1,
        )
        self.assertEqual(report.turnover, Decimal("0.5"))
        self.assertEqual(report.fees, Decimal("2.5"))
        self.assertEqual(report.fills, 3)
        self.assertEqual(report.rejected_orders, 1)
