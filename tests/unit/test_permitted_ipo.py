"""Data integrity and access-boundary tests for the permitted publisher adapter."""

import importlib.util
import json
import sys
import tempfile
import unittest
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[2] / "scripts/update_permitted_ipo.py"
spec = importlib.util.spec_from_file_location("permitted_ipo", MODULE)
ipo = importlib.util.module_from_spec(spec)
with patch.object(sys, "path", [str(MODULE.parent), *sys.path]):
    spec.loader.exec_module(ipo)


class PermittedPublisherTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 25, 6, tzinfo=UTC)
        self.observed = self.now.isoformat()
        self.row = {
            "name": "Example Industries Limited",
            "slug": "example-ipo",
            "symbol": "EXAMPLE",
            "board": "MAINBOARD",
            "status": "UPCOMING",
            "lifecycle": {"conflicted": False},
            "openDate": "2026-10-27T00:00:00.000Z",
            "closeDate": "2026-10-29T00:00:00.000Z",
            "priceMin": 100,
            "priceMax": 110,
            "lotSize": 100,
            "lastGmp": 10,
            "lastSubX": 3,
            "gmpSources": 2,
            "gmpDisputed": False,
            "updatedAt": (self.now - timedelta(hours=1)).isoformat(),
        }

    def feed(self, *rows):
        return {
            "ok": True,
            "count": len(rows),
            "ipos": list(rows),
            "disclaimer": "Aggregated public information; GMP is unofficial and unverified.",
        }

    def build(self, data=None, **kwargs):
        return ipo.build_snapshot(
            data or self.feed(self.row), observed_at=self.observed, now=self.now, **kwargs
        )

    def test_calendar_demand_and_gmp_do_not_share_receipt_clock(self):
        row = deepcopy(self.row)
        row["updatedAt"] = (self.now - timedelta(hours=40)).isoformat()
        result = self.build(self.feed(row))
        issue = result["issues"][0]
        self.assertEqual(issue["sourceObservedAt"], self.observed)
        self.assertEqual(issue["sourceUpdatedAt"], row["updatedAt"])
        self.assertIsNone(issue["gmp"])
        self.assertIsNone(issue["subscription"]["total"])
        self.assertIsNone(issue["bidDeadline"])
        self.assertIsNone(issue["mandateDeadline"])
        self.assertIsNone(issue["registrar"])
        self.assertEqual(result["disclaimer"], self.feed(row)["disclaimer"])

    def test_negative_gmp_is_preserved_and_disputes_are_carried(self):
        self.row.update(lastGmp=-5, gmpDisputed=True)
        issue = self.build()["issues"][0]
        self.assertEqual(issue["gmp"], -5)
        self.assertTrue(issue["gmpDisputed"])
        self.assertEqual(issue["gmpAsOf"], self.row["updatedAt"])
        self.assertIn("Xflot", issue["gmpReadings"][0]["attribution"])

    def test_undated_and_conflicted_rows_do_not_become_application_candidates(self):
        undated = {**self.row, "openDate": None, "slug": "undated-ipo"}
        conflict = {**self.row, "lifecycle": {"conflicted": True}, "slug": "conflicted-ipo"}
        result = self.build(self.feed(self.row, undated, conflict))
        self.assertEqual(len(result["issues"]), 1)
        self.assertEqual(result["sourceCoverage"]["excluded"]["undated"], 1)
        self.assertEqual(result["sourceCoverage"]["excluded"]["conflicted"], 1)

    def test_duplicate_identity_and_backwards_dates_fail_closed(self):
        with self.assertRaises(ValueError):
            self.build(self.feed(self.row, self.row))
        with self.assertRaises(ValueError):
            self.build(self.feed({**self.row, "openDate": "2026-11-01T00:00:00.000Z"}))

    def test_missing_or_future_observation_never_renews_calendar(self):
        for observed in [
            "bad",
            (self.now + timedelta(minutes=2)).isoformat(),
            (self.now - timedelta(hours=4)).isoformat(),
        ]:
            with self.subTest(observed=observed), self.assertRaises(ValueError):
                ipo.build_snapshot(self.feed(self.row), observed_at=observed, now=self.now)

    def test_only_exact_company_board_and_dates_preserve_tracking_id(self):
        previous = {
            "issues": [
                {
                    "id": "ORIGINAL",
                    "company": self.row["name"],
                    "board": "MAINBOARD",
                    "openDate": "2026-10-27",
                    "closeDate": "2026-10-29",
                    "news": [],
                }
            ]
        }
        self.assertEqual(self.build(previous=previous)["issues"][0]["id"], "ORIGINAL")
        previous["issues"][0]["board"] = "SME"
        self.assertEqual(self.build(previous=previous)["issues"][0]["id"], "EXAMPLE")

    def test_schema_disclaimer_and_count_are_required(self):
        for patch_value in [{"disclaimer": ""}, {"count": 99}, {"ok": False}]:
            with self.subTest(patch_value=patch_value), self.assertRaises(ValueError):
                self.build({**self.feed(self.row), **patch_value})

    def test_failure_is_reserved_and_not_immediately_retried(self):
        class Broken:
            calls = 0

            def open(self, *_args, **_kwargs):
                self.calls += 1
                raise OSError("offline")

        opener = Broken()
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "cache.json"
            for _ in range(2):
                with self.assertRaises((OSError, ValueError)):
                    ipo.cached_fetch(ipo.XFLOT, path, now=self.now, opener=opener)
            self.assertEqual(opener.calls, 1)
            self.assertEqual(json.loads(path.read_text())["attemptedAt"], self.observed)
            with self.assertRaises(ValueError):
                ipo.cached_fetch("https://www.nseindia.com/api/anything", path, now=self.now)

    def test_cached_reuse_retains_original_observation_time(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "cache.json"
            observed = (self.now - timedelta(minutes=10)).isoformat()
            ipo.atomic(
                path, {"attemptedAt": observed, "observedAt": observed, "data": self.feed(self.row)}
            )
            _, actual = ipo.cached_fetch(ipo.XFLOT, path, now=self.now)
            self.assertEqual(actual, observed)

    def test_ambiguous_security_types_and_price_units_are_quarantined(self):
        fractional = {**self.row, "slug": "fractional-ipo", "priceMin": 0.17, "priceMax": 0.18}
        social = {**self.row, "name": "Example Foundation - ZCZP", "slug": "social-issue"}
        series = {**self.row, "symbol": "EXAG04", "lotSize": None, "slug": "series-issue"}
        result = self.build(self.feed(self.row, fractional, social, series))
        self.assertEqual(len(result["issues"]), 1)
        self.assertEqual(result["sourceCoverage"]["excluded"]["quarantined"], 3)
        self.assertEqual(result["issues"][0]["id"], "EXAMPLE")
