"""Broker-free CLI tests using synthetic-only historical fixtures."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from atlas.integrations.history_store import CandleArchive
from tests.unit.test_atlas_nse_integrations import synthetic_batch

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "atlas_research_command.py"


def cli(*args: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    for key in ("UPSTOX_ANALYTICS_TOKEN", "FYERS_APP_ID", "FYERS_ACCESS_TOKEN", "OPENALGO_API_KEY"):
        env.pop(key, None)
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        env=env,
        check=False,
        timeout=25,
    )


class AtlasResearchCommandTests(unittest.TestCase):
    def test_fail_closed_readiness(self):
        p = cli("status")
        self.assertEqual(p.returncode, 0)
        x = json.loads(p.stdout)
        self.assertFalse(x["live_money_enabled"])
        self.assertFalse(x["upstox_token_configured"])
        self.assertFalse(x["fyers_credentials_configured"])

    def test_credentials_missing_do_not_fabricate_history(self):
        p = cli(
            "ingest",
            "--provider",
            "upstox",
            "--instrument",
            "NSE_EQ|INE123456789",
            "--from-date",
            "2026-10-05",
            "--to-date",
            "2026-10-05",
        )
        self.assertEqual(p.returncode, 2)
        self.assertIn("BLOCKED_OR_INVALID", p.stdout)

    def test_archive_comparison_and_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "history.duckdb")
            target = str(Path(tmp) / "history.parquet")
            b = synthetic_batch()
            CandleArchive(Path(path)).add(b)
            p = cli(
                "compare",
                "--provider",
                "upstox_v3",
                "--instrument",
                b.instrument,
                "--archive",
                path,
            )
            self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
            x = json.loads(p.stdout)
            self.assertEqual(x["candles"], 65)
            self.assertEqual(x["initial_cash_inr"], "100000")
            self.assertFalse(x["universe_verified"])
            p = cli("export", "--archive", path, "--output", target)
            self.assertEqual(p.returncode, 0, p.stdout)
            self.assertGreater(Path(target).stat().st_size, 0)

    def test_backfill_requires_read_only_provider_token(self):
        p = cli(
            "backfill",
            "--provider",
            "upstox",
            "--instrument",
            "NSE_EQ|INE123456789",
            "--from-date",
            "2026-10-05",
            "--to-date",
            "2026-10-06",
        )
        self.assertEqual(p.returncode, 2)
        self.assertIn("BLOCKED_OR_INVALID", p.stdout)

    def test_backfill_fails_closed_without_account(self):
        p = cli(
            "backfill",
            "--provider",
            "upstox",
            "--instrument",
            "NSE_EQ|INE123456789",
            "--from-date",
            "2022-01-03",
            "--to-date",
            "2022-01-31",
        )
        self.assertEqual(p.returncode, 2, p.stdout + p.stderr)
        self.assertIn("BLOCKED_OR_INVALID", p.stdout)
        self.assertNotIn("live_orders", p.stdout)

    def test_openalgo_not_order_capable_without_auth(self):
        p = cli("analyzer-status")
        self.assertEqual(p.returncode, 2)
        self.assertIn("BLOCKED_OR_INVALID", p.stdout)
