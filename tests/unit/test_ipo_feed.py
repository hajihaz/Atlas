"""Regression tests for licensed-source-friendly, read-only IPO feed and fail-closed semantics."""

import importlib.util
import tempfile
import unittest
from datetime import UTC, date
from pathlib import Path
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[2] / "scripts/update_ipo_feed.py"
spec = importlib.util.spec_from_file_location("ipo_feed", MODULE)
ipo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ipo)


class IpoFeedTests(unittest.TestCase):
    def test_bse_outage_keeps_verified_sme_stale_not_live(self):
        from datetime import datetime

        current = datetime.now(UTC).isoformat(timespec="seconds")
        previous = {
            "schemaVersion": 1,
            "generatedAt": current,
            "issues": [
                {
                    "id": "BSESME-12",
                    "company": "Example SME",
                    "board": "SME",
                    "source": ipo.BSE_SME_URL,
                    "detailSource": "https://www.bseindia.com/markets/publicIssues/DisplayIPO.aspx?type=IPO&IPONo=12",
                    "openDate": "2026-10-23",
                    "closeDate": "2026-10-26",
                    "status": "OPEN",
                    "sourceObservedAt": current,
                    "subscription": {"total": 8.0},
                    "gmp": 44.0,
                }
            ],
        }
        with (
            patch.object(ipo, "get_json", return_value=[]),
            patch.object(ipo, "recent_bse_sme", side_effect=ValueError("blocked")),
            patch.object(ipo, "add_unofficial_gmp"),
        ):
            result = ipo.build_snapshot(previous)
        self.assertEqual(len(result["issues"]), 1)
        self.assertEqual(result["issues"][0]["company"], "Example SME")
        self.assertTrue(result["issues"][0]["sourceStale"])
        self.assertIsNone(result["issues"][0]["subscription"]["total"])
        self.assertIsNone(result["issues"][0]["gmp"])
        self.assertIn("stale", result["coverage"]["sme"].lower())

    def test_rejects_untrusted_sme_fallback_records(self):
        previous = {
            "schemaVersion": 1,
            "generatedAt": "2026-10-23T00:00:00Z",
            "issues": [
                {
                    "id": "<script>",
                    "company": "Bad",
                    "board": "SME",
                    "source": ipo.BSE_SME_URL,
                    "detailSource": "https://evil.example",
                    "closeDate": "2026-10-27",
                    "openDate": "2026-10-23",
                },
                {
                    "id": "BSESME-78",
                    "company": "Expired",
                    "board": "SME",
                    "source": ipo.BSE_SME_URL,
                    "detailSource": "https://www.bseindia.com/markets/publicIssues/DisplayIPO.aspx?type=IPO&IPONo=78",
                    "openDate": "2020-01-01",
                    "closeDate": "2020-01-05",
                },
            ],
        }
        self.assertEqual(ipo.retained_sme(previous, today=date(2026, 10, 23)), [])

    def test_official_issuer_prospectus_links_and_registrar(self):
        issue = ipo.transform_issue(
            {
                "symbol": "TEST",
                "companyName": "Test India Ltd",
                "series": "EQ",
                "issueStartDate": "21-Oct-2026",
                "issueEndDate": "23-Oct-2026",
                "issuePrice": "Rs.100",
                "status": "Active",
            }
        )
        with patch.object(
            ipo,
            "get_json",
            return_value={
                "bidDetails": [],
                "issueInfo": {
                    "dataList": [
                        {
                            "title": "Red Herring Prospectus",
                            "value": "https://nsearchives.nseindia.com/content/ipo/RHP_TEST.zip",
                        },
                        {
                            "title": "Ratios / Basis of Issue Price",
                            "value": "https://nsearchives.nseindia.com/content/ipo/RATIOS_TEST.zip",
                        },
                        {"title": "Name of the Registrar", "value": "Example Registrar"},
                    ]
                },
            },
        ):
            ipo.enrich_detail(issue)
        self.assertTrue(issue["rhpUrl"].endswith("RHP_TEST.zip"))
        self.assertEqual(issue["registrar"], "Example Registrar")

    def test_gmp_match_rejects_wrong_issue_and_board(self):
        issue = {
            "id": "TEST",
            "company": "Example Industries Limited",
            "board": "MAINBOARD",
            "closeDate": "2026-10-23",
        }
        item = {
            "name": "Example Industries",
            "symbol": "TEST",
            "board": "SME",
            "closeDate": "2026-10-23",
        }
        self.assertFalse(ipo.match_issue(issue, item, "Xflot"))
        item["board"] = "MAINBOARD"
        item["closeDate"] = "2026-10-25"
        self.assertFalse(ipo.match_issue(issue, item, "Xflot"))
        item["closeDate"] = "2026-10-23"
        self.assertTrue(ipo.match_issue(issue, item, "Xflot"))

    def test_stale_gmp_refused_and_signed_discount(self):
        from datetime import datetime

        self.assertEqual(ipo.valid_quote(-15.3), -15.3)
        self.assertIsNone(ipo.valid_quote(float("inf")))
        self.assertIsNone(
            ipo.fresh_timestamp("2026-10-10T01:00:00Z", now=datetime(2026, 10, 23, tzinfo=UTC))
        )

    def test_accuracy_license_required(self):
        with self.assertRaises(ValueError):
            ipo.build_gmp_accuracy({"licence": "other", "rows": []})
        item = {
            "licence": "CC BY 4.0",
            "summary": {"n": 1},
            "rows": [{"name": "Issuer", "actual_pct": -2.5, "predicted_pct": 10.0}],
        }
        self.assertEqual(ipo.build_gmp_accuracy(item)["rows"][0]["actualPct"], -2.5)

    def test_mandate_time_is_source_derived(self):
        self.assertEqual(
            ipo.parse_mandate_deadline("23-Oct-2026 (upto 5:00 PM)"), "2026-10-23T17:00:00+05:30"
        )
        self.assertIsNone(ipo.parse_mandate_deadline("end of day"))

    def test_valid_mainboard(self):
        row = {
            "symbol": "HELLO",
            "companyName": "Example Industries",
            "series": "EQ",
            "issueStartDate": "21-Oct-2026",
            "issueEndDate": "23-Oct-2026",
            "issuePrice": "Rs.120 to Rs.135",
            "status": "Active",
        }
        out = ipo.transform_issue(row)
        self.assertEqual(out["board"], "MAINBOARD")
        self.assertEqual((out["priceMin"], out["priceMax"]), (120, 135))
        self.assertIsNone(out["gmp"])
        self.assertIsNone(out["mandateDeadline"])

    def test_sme_never_assumed_retail(self):
        row = {
            "symbol": "SMEIPO",
            "companyName": "Example SME",
            "series": "SME",
            "issueStartDate": "21-Oct-2026",
            "issueEndDate": "24-Oct-2026",
            "issuePrice": "Rs.200",
            "status": "Forthcoming",
        }
        out = ipo.transform_issue(row)
        self.assertEqual(out["board"], "SME")
        self.assertIsNone(out["lotSize"])
        self.assertIsNone(out["subscription"]["retail"])

    def test_invalid_issue_ignored(self):
        self.assertIsNone(ipo.transform_issue({"symbol": "<script>", "companyName": "Fake"}))
        self.assertIsNone(ipo.date_iso("not a date"))
        self.assertEqual(ipo.price_band("not published"), (None, None))

    def test_subscription_categories(self):
        values = ipo.summary_categories(
            [
                {"category": "Qualified Institutional Buyers(QIBs)", "noOfTime": "2.4"},
                {"category": "Total", "noOfTime": "7.2"},
            ]
        )
        self.assertEqual(values["qib"], 2.4)
        self.assertIsNone(values["retail"])
        self.assertEqual(values["total"], 7.2)

    def test_bse_sme_filters_historical_and_rights_issues(self):
        fixture = (
            '<table id="ContentPlaceHolder1_tblID"><tr><td><a href="https://www.bse'
            "india.com/markets/publicIssues/DisplayIPO.aspx?id=1&type=IPO&idtype=2&"
            'IPONo=12">Example SME</a></td><td>23-10-2026</td><td>26-10-2026</td><t'
            'd>95.00 - 100.00</td></tr><tr><td><a href="https://www.bseindia.com/ma'
            'rkets/publicIssues/DisplayIPO.aspx?id=3&type=RI&IPONo=13">Rights issue'
            "</a></td><td>23-10-2026</td><td>26-10-2026</td><td>90.00</td></tr></ta"
            "ble>"
        )
        rows = ipo.recent_bse_sme(now=date(2026, 10, 23), html_text=fixture)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["board"], "SME")
        self.assertEqual(rows[0]["status"], "OPEN")
        self.assertEqual(rows[0]["id"], "BSESME-12")

    def test_rejects_non_https_or_unapproved_ipo_urls_without_network(self):
        for url in (
            "file:///etc/passwd",
            "http://www.nseindia.com/api/ipo-detail",
            "https://malicious.example/api/ipo-detail",
        ):
            with self.assertRaisesRegex(ValueError, "Untrusted IPO provider URL"):
                ipo.get_json(url)

    def test_provider_failure_does_not_erase_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "ipo-feed.json"
            output.write_text('{"preserve":true}', encoding="utf8")
            with patch.object(ipo, "get_json", side_effect=ValueError("source changed")):
                code = ipo.main_with_output(output) if hasattr(ipo, "main_with_output") else None
                self.assertIsNone(code)
                with self.assertRaises(ValueError):
                    ipo.build_snapshot()
            self.assertEqual(output.read_text(encoding="utf8"), '{"preserve":true}')


if __name__ == "__main__":
    unittest.main()
