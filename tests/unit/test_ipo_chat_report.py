"""Proof that ChatGPT IPO briefing does not invent Apply verdicts or live demand."""

import importlib.util
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

MODULE = Path(__file__).resolve().parents[2] / "scripts/ipo_chat_report.py"
spec = importlib.util.spec_from_file_location("ipo_chat_report", MODULE)
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)
IST = ZoneInfo("Asia/Kolkata")
NOW = datetime(2026, 10, 23, 9, 20, tzinfo=IST)
BASE = {
    "id": "TEST",
    "company": "Example Issuer Limited",
    "board": "MAINBOARD",
    "openDate": "2026-10-22",
    "closeDate": "2026-10-23",
    "status": "OPEN",
    "priceMax": 500,
    "lotSize": 25,
    "subscription": {"total": 2.65},
    "gmp": 30,
    "gmpAsOf": "2026-10-23T03:40:00+05:30",
    "gmpProvider": "Example",
    "sourceObservedAt": "2026-10-23T09:15:00+05:30",
    "sourceStale": False,
    "detailSource": "https://www.nseindia.com/market-data/issue-information?symbol=TEST",
}


def sample(item=None, timestamp="2026-10-23T09:16:00+05:30"):
    return {
        "schemaVersion": 1,
        "generatedAt": timestamp,
        "issues": [item or dict(BASE)],
        "coverage": {"mainboard": "NSE", "sme": "BSE"},
    }


class ReportSafetyTests(unittest.TestCase):
    def test_active_without_valuation_recommends_hold(self):
        result = report.build_report(sample(), now=NOW)
        self.assertEqual(result["totalUpcomingAndOpen"], 1)
        self.assertEqual(result["issues"][0]["decision"], "HOLD · INCOMPLETE RESEARCH")
        self.assertEqual(result["issues"][0]["subscriptionX"], 2.65)
        self.assertEqual(result["issues"][0]["unofficialGmpINR"], 30)
        self.assertIn("Example Issuer", report.markdown_report(result))

    def test_stale_feed_clears_demand_and_gmp(self):
        stale = sample(timestamp="2026-10-20T09:15:00+05:30")
        result = report.build_report(stale, now=NOW)
        self.assertTrue(result["feedStale"])
        self.assertEqual(result["issues"][0]["decision"], "HOLD · SOURCE STALE")
        self.assertIsNone(result["issues"][0]["subscriptionX"])
        self.assertIsNone(result["issues"][0]["unofficialGmpINR"])

    def test_stale_issue_even_if_feed_recent(self):
        entry = {**BASE, "sourceStale": True}
        result = report.build_report(sample(entry), now=NOW)
        self.assertIsNone(result["issues"][0]["subscriptionX"])
        self.assertEqual(result["issues"][0]["decision"], "HOLD · SOURCE STALE")

    def test_gmp_must_have_recent_observation(self):
        entry = {**BASE, "gmpAsOf": "2026-10-10T03:40:00+05:30"}
        result = report.build_report(sample(entry), now=NOW)
        self.assertIsNone(result["issues"][0]["unofficialGmpINR"])

    def test_unmatched_research_not_attached(self):
        research = {
            "schemaVersion": 1,
            "records": [
                {
                    "id": "TEST",
                    "board": "SME",
                    "company": BASE["company"],
                    "financials": {
                        "source": "https://www.sebi.gov.in/sebi_data/commondocs/abc.pdf",
                        "valuationVerified": False,
                        "peerComparisonVerified": False,
                    },
                }
            ],
        }
        result = report.build_report(sample(), research, now=NOW)
        self.assertEqual(result["issues"][0]["decision"], "HOLD · INCOMPLETE RESEARCH")

    def test_exact_source_financials_keep_hold_for_valuation(self):
        research = {
            "schemaVersion": 1,
            "records": [
                {
                    "id": "TEST",
                    "board": "MAINBOARD",
                    "company": BASE["company"],
                    "financials": {
                        "source": "https://www.sebi.gov.in/sebi_data/commondocs/abc.pdf",
                        "valuationVerified": False,
                        "peerComparisonVerified": False,
                    },
                }
            ],
        }
        result = report.build_report(sample(), research, now=NOW)
        self.assertEqual(result["issues"][0]["decision"], "HOLD · VALUATION REVIEW")

    def test_closed_dates_not_published_as_open(self):
        entry = {**BASE, "closeDate": "2026-10-22"}
        result = report.build_report(sample(entry), now=NOW)
        self.assertEqual(result["totalUpcomingAndOpen"], 0)

    def test_invalid_timestamps_fail_closed(self):
        with self.assertRaises(ValueError):
            report.build_report(sample(timestamp="N/A"), now=NOW)


if __name__ == "__main__":
    unittest.main()
