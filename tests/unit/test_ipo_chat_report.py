"""Proof that ChatGPT IPO briefing does not invent Apply verdicts or live demand."""

import copy
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


class IssuerResearchReviewTests(unittest.TestCase):
    def setUp(self):
        import json

        self.now = datetime(2026, 10, 26, 9, 30, tzinfo=IST)
        self.catalog = json.loads(
            (MODULE.parents[1] / "frontend/public/ipo-issuer-reviews.json").read_text()
        )
        self.rows = report.valid_reviews_by_key(self.catalog, self.now)

    def test_real_catalog_preserves_period_unit_and_accounting_basis(self):
        self.assertEqual(len(self.rows), 8)
        records = {x["id"]: x for x in self.rows.values()}
        self.assertEqual(records["EDELALTS"]["stage"], "CURRENT_RHP")
        self.assertEqual(records["MKSONS"]["stage"], "CURRENT_RHP")
        metrics = {m["key"]: m["value"] for m in records["SFCTECH"]["metrics"]}
        self.assertEqual(metrics["revenue"], 803.629)
        self.assertEqual(metrics["cfo"], -25.802)
        self.assertIn("netDebtEquity", metrics)
        self.assertNotIn("debtEquity", metrics)

    def test_join_requires_exact_offer_and_bad_sources_or_numbers_fail_closed(self):
        import copy

        row = copy.deepcopy(self.catalog["records"][0])
        mutations = [
            lambda r: r["sources"][0].update(url="https://www.sebi.gov.in.evil.invalid/file.pdf"),
            lambda r: r["sources"][0].update(sha256="fake"),
            lambda r: r["metrics"][0].update(value=True),
            lambda r: r["metrics"][0].update(page=1499),
            lambda r: r.update(closeDate="2026-02-31"),
            lambda r: r.update(decision="APPLY"),
        ]
        for mutate in mutations:
            broken = copy.deepcopy(row)
            mutate(broken)
            with self.subTest(broken=broken["id"]):
                self.assertEqual(
                    report.valid_reviews_by_key(
                        {"schemaVersion": 1, "records": [broken]}, self.now
                    ),
                    {},
                )
        self.assertEqual(
            report.valid_reviews_by_key({"schemaVersion": 1, "records": [row, row]}, self.now), {}
        )

        item = {
            **BASE,
            **{k: row[k] for k in ("id", "company", "board", "openDate", "closeDate")},
            "sourceObservedAt": self.now.isoformat(),
            "priceMin": 142,
            "priceMax": 150,
        }
        feed = sample(item, self.now.isoformat())
        result = report.build_report(feed, reviews=self.catalog, now=self.now)["issues"][0]
        self.assertEqual(result["issuerReview"]["historicalPEScenario"]["fairValueVerified"], False)
        self.assertAlmostEqual(result["issuerReview"]["historicalPEScenario"]["high"], 150 / 5.99)
        item["closeDate"] = "2026-11-05"
        self.assertIsNone(
            report.build_report(
                sample(item, self.now.isoformat()), reviews=self.catalog, now=self.now
            )["issues"][0]["issuerReview"]
        )

    def test_calendar_refresh_does_not_refresh_old_publisher_demand(self):
        item = {
            **BASE,
            "sourceKind": "PUBLISHER_AGGREGATE",
            "subscriptionAsOf": "2026-10-20T00:00:00Z",
        }
        result = report.build_report(sample(item), now=NOW)["issues"][0]
        self.assertIsNone(result["subscriptionX"])
        self.assertFalse(result["sourceStale"])

    def test_verified_bid_cutoff_closes_issue_before_later_mandate_deadline(self):
        item = {
            **BASE,
            "bidDeadline": "2026-10-23T09:00:00+05:30",
            "mandateDeadline": "2026-10-23T17:00:00+05:30",
        }
        self.assertEqual(report.build_report(sample(item), now=NOW)["issues"], [])

    def test_eaaa_current_rhp_preserves_hold_and_annual_valuation_basis(self):
        row = next(x for x in self.catalog["records"] if x["id"] == "EDELALTS")
        self.assertEqual(row["stage"], "CURRENT_RHP")
        values = {m["key"]: m["value"] for m in row["metrics"]}
        self.assertEqual(values["revenue"], 869.54)
        self.assertEqual(values["totalIncome"], 963.759)
        self.assertEqual(values["cfo"], 235.244)
        self.assertEqual(values["quarterCFO"], 130.384)
        self.assertEqual(values["patMargin"], 27.52)
        self.assertFalse(any(p["company"].startswith("Gaja") for p in row["peerContext"]["peers"]))
        item = {
            **BASE,
            **{k: row[k] for k in ("id", "company", "board", "openDate", "closeDate")},
            "sourceObservedAt": self.now.isoformat(),
            "priceMin": 1585,
            "priceMax": 1665,
        }
        result = report.build_report(
            sample(item, self.now.isoformat()), reviews=self.catalog, now=self.now
        )["issues"][0]
        research = result["issuerReview"]
        self.assertEqual(research["stage"], "CURRENT_RHP")
        self.assertAlmostEqual(research["historicalPEScenario"]["high"], 1665 / 40.36)
        self.assertFalse(research["historicalPEScenario"]["fairValueVerified"])
        self.assertIn("HOLD", result["decision"])
        draft = copy.deepcopy(self.catalog)
        next(x for x in draft["records"] if x["id"] == "EDELALTS")["stage"] = "DRAFT_ONLY"
        result = report.build_report(
            sample(item, self.now.isoformat()), reviews=draft, now=self.now
        )["issues"][0]
        self.assertIsNone(result["issuerReview"]["historicalPEScenario"])

    def test_independent_peer_audit_preserves_bonus_basis_and_separate_quote_clocks(self):
        row = next(x for x in self.rows.values() if x["id"] == "EDELALTS")
        audit = row["independentPeerAudit"]
        self.assertFalse(audit["fairValueVerified"])
        self.assertEqual(len(audit["peers"]), 9)
        anand = next(x for x in audit["peers"] if x["ticker"] == "ANANDRATHI.NS")
        self.assertEqual(anand["annualEPS"]["value"], 23.58)
        self.assertAlmostEqual(anand["price"] / anand["annualEPS"]["value"], 94.7837150127)
        self.assertTrue(all(p["priceAsOf"].startswith("2026-10-23") for p in audit["peers"]))
        self.assertEqual(row["peerContext"]["priceAsOf"], "2026-10-08")
        item = {"priceMin": 1585, "priceMax": 1665}
        result = report.review_summary(row, item, False)
        self.assertEqual(result["independentPeerAudit"], audit)
        self.assertEqual(result["decision"], "HOLD_FOR_MANUAL_REVIEW")

    def test_invalid_peer_currency_period_source_clock_and_fair_value_fail_closed(self):
        row = next(x for x in self.catalog["records"] if x["id"] == "EDELALTS")
        mutations = [
            lambda a: a["peers"][0].update(currency="USD"),
            lambda a: a["peers"][0]["annualEPS"].update(periodEnd="2026-06-30"),
            lambda a: a["peers"][0]["annualEPS"].update(page=1499),
            lambda a: a["peers"][0].update(priceAsOf="2099-01-01T00:00:00Z"),
            lambda a: a.update(fairValueVerified=True),
            lambda a: a["sources"][0].update(
                url=a["sources"][0]["url"].replace(
                    "nsearchives.nseindia.com", "nsearchives.nseindia.com.evil.invalid"
                )
            ),
        ]
        for mutate in mutations:
            broken = copy.deepcopy(row)
            mutate(broken["independentPeerAudit"])
            with self.subTest(mutation=mutations.index(mutate)):
                self.assertEqual(
                    report.valid_reviews_by_key(
                        {"schemaVersion": 1, "records": [broken]}, self.now
                    ),
                    {},
                )
