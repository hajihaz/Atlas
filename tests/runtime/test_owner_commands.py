from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from atlas.paper.live_runner import add_strategy, connect, ingest
from atlas.runtime.local_ledger import report
from atlas.runtime.risk_guard import enforce


class OwnerCommandTransportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "paper.sqlite3"
        self.db = connect(self.path)
        self.addCleanup(self.db.close)
        self.now = int(time.time())
        add_strategy(
            self.db,
            id="fixture-paper",
            symbol="BTCINR",
            kind="sma",
            fast=2,
            slow=3,
            now=self.now - 100,
            allocation_bps=10000,
        )
        for i, price in enumerate([100, 101, 102, 103, 102, 101, 100, 99]):
            timestamp = self.now - 90 + i * 10
            ingest(
                self.db,
                [
                    {
                        "symbol": symbol,
                        "timestamp": timestamp,
                        "bid": str(price),
                        "ask": str(price + 0.1),
                    }
                    for symbol in ("BTCINR", "ETHINR")
                ],
                timestamp,
            )

    def run_command(self, *args, authorized=False, source=None):
        env = os.environ.copy()
        env["ATLAS_PAPER_DB_PATH"] = str(source or self.path)
        env["ATLAS_ALLOW_PAPER_CONTROL"] = "1" if authorized else "0"
        process = subprocess.run(
            [sys.executable, "-m", "atlas.runtime.command", *args],
            env=env,
            capture_output=True,
            text=True,
            timeout=10,
        )
        self.assertEqual(process.stderr, "")
        result = json.loads(process.stdout)
        self.assertFalse(result["realOrdersEnabled"])
        self.assertNotIn(str(self.path), process.stdout)
        return process.returncode, result

    def test_status_preserves_source_records_and_reports_actual_paper_evidence(self):
        before = self.db.execute("SELECT COUNT(*) FROM fills").fetchone()[0]
        code, response = self.run_command("status")
        self.assertEqual(code, 0)
        self.assertEqual(response["schema"], "atlas.owner-command.v1")
        account = response["result"]["accounts"][0]
        self.assertTrue(account["accountingVerified"])
        self.assertEqual(account["paperFills"], before)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM fills").fetchone()[0], before)

    def test_account_and_ist_day_reports_use_the_reconciled_records(self):
        code, response = self.run_command("report", "--strategy", "fixture-paper")
        self.assertEqual(code, 0)
        self.assertEqual(response["result"]["account"]["id"], "fixture-paper")
        date = datetime.fromtimestamp(self.now, ZoneInfo("Asia/Kolkata")).date().isoformat()
        code, day = self.run_command("report", "--strategy", "fixture-paper", "--date", date)
        self.assertEqual(code, 0)
        expected = sum(
            datetime.fromtimestamp(row[0], ZoneInfo("Asia/Kolkata")).date().isoformat() == date
            for row in self.db.execute("SELECT source_ts FROM fills")
        )
        self.assertEqual(day["result"]["totalEvents"], expected)
        self.assertTrue(day["result"]["accountingVerified"])

    def test_pause_requires_owner_enablement_and_preserves_fills(self):
        before = self.db.execute("SELECT COUNT(*) FROM fills").fetchone()[0]
        args = ("pause", "--strategy", "fixture-paper", "--request-id", "owner-pause-test123456")
        code, denied = self.run_command(*args)
        self.assertEqual(code, 2)
        self.assertEqual(denied["error"], "paper_control_denied")
        self.assertEqual(self.db.execute("SELECT active FROM strategies").fetchone()[0], 1)
        code, first = self.run_command(*args, authorized=True)
        self.assertEqual(code, 0)
        code, replay = self.run_command(*args, authorized=True)
        self.assertEqual(code, 0)
        self.assertEqual(first, replay)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM fills").fetchone()[0], before)
        self.assertEqual(self.db.execute("SELECT active FROM strategies").fetchone()[0], 0)

    def test_request_id_conflict_cannot_change_account_state(self):
        common = ("--strategy", "fixture-paper", "--request-id", "owner-conflict-123456")
        self.assertEqual(self.run_command("pause", *common, authorized=True)[0], 0)
        self.assertEqual(self.run_command("resume", *common, authorized=True)[0], 2)
        self.assertEqual(self.db.execute("SELECT active FROM strategies").fetchone()[0], 0)

    def test_risk_latch_vetoes_resume_through_authenticated_transport(self):
        # Start from a fresh artificial account and create an observed drawdown.
        self.db.execute("DELETE FROM fills")
        self.db.execute("DELETE FROM quotes")
        self.db.execute(
            "UPDATE strategies SET cash_paise=initial_paise,units='0',pending='',seen_ts=0"
        )
        for i, price in enumerate([100, 101, 102, 103, 50]):
            timestamp = self.now - 50 + i * 10
            ingest(
                self.db,
                [
                    {
                        "symbol": symbol,
                        "timestamp": timestamp,
                        "bid": str(price),
                        "ask": str(price + 0.1),
                    }
                    for symbol in ("BTCINR", "ETHINR")
                ],
                timestamp,
            )
        enforce(self.path, self.now)
        before = self.db.execute("SELECT COUNT(*) FROM fills").fetchone()[0]
        code, result = self.run_command(
            "resume",
            "--strategy",
            "fixture-paper",
            "--request-id",
            "owner-risk-veto-123456",
            authorized=True,
        )
        self.assertEqual(code, 2)
        self.assertEqual(result["error"], "paper_control_denied")
        self.assertFalse(report(self.path)["accounts"][0]["active"])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM fills").fetchone()[0], before)

    def test_unsupported_or_ambiguous_commands_fail_closed_without_argument_echo(self):
        for args in [
            ("order", "--token", "private-input-must-not-echo"),
            ("status", "--strategy", "fixture-paper"),
            ("status", "--date", "2026-01-01"),
            ("status", "--request-id", ""),
            ("report", "--strategy", "fixture-paper", "--date", ""),
            ("report", "--date", "2026-01-01"),
            ("report", "--strategy", "fixture-paper", "--offset", "100"),
            ("pause", "--strategy", "fixture-paper"),
            ("report", "--strategy", "../../etc/passwd"),
            ("report", "--strategy", "fixture-paper", "--offset", "-1"),
            ("status", "--offset", "NaN"),
            ("status", "--db", "/private/should-not-open"),
        ]:
            with self.subTest(args=args):
                code, response = self.run_command(*args, authorized=True)
                self.assertNotEqual(code, 0)
                self.assertEqual(response["error"], "invalid_or_unverified_request")
                self.assertNotIn("private-input-must-not-echo", json.dumps(response))

    def test_missing_database_is_not_created_and_its_path_is_not_disclosed(self):
        missing = self.path.with_name("missing.sqlite3")
        code, response = self.run_command("status", source=missing)
        self.assertNotEqual(code, 0)
        self.assertFalse(missing.exists())
        self.assertNotIn(str(missing), json.dumps(response))


if __name__ == "__main__":
    unittest.main()
