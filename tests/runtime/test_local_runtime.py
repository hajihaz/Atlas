from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from atlas.paper.live_runner import add_strategy, connect, ingest
from atlas.runtime.controls import set_active
from atlas.runtime.local_ledger import report, trade_day

NOW = 1800000100


class LocalRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "paper.sqlite3"
        self.db = connect(self.path)
        self.addCleanup(self.db.close)
        add_strategy(
            self.db, id="btc-sma", symbol="BTCINR", kind="sma", fast=2, slow=3, now=NOW - 100
        )
        for i, price in enumerate([100, 101, 102, 103, 102, 101, 100, 99]):
            ts = NOW - 90 + i * 10
            ingest(
                self.db,
                [
                    {"symbol": s, "timestamp": ts, "bid": str(price), "ask": str(price + 0.1)}
                    for s in ("BTCINR", "ETHINR")
                ],
                ts,
            )

    def test_report_reconciles_every_fill_without_modifying_ledger(self):
        before = self.db.execute("SELECT total_changes()").fetchone()[0]
        result = report(self.path, NOW)
        account = result["accounts"][0]
        self.assertTrue(account["accountingVerified"])
        self.assertGreater(account["paperFills"], 0)
        self.assertAlmostEqual(
            account["netPnlINR"], account["realizedPnlINR"] + account["unrealizedPnlINR"]
        )
        self.assertEqual(result["actualCapitalINR"], 0)
        self.assertFalse(result["realOrdersEnabled"])
        self.assertEqual(before, self.db.execute("SELECT total_changes()").fetchone()[0])

    def test_forged_recorded_cash_fails_closed(self):
        self.db.execute("UPDATE strategies SET cash_paise=cash_paise+1")
        with self.assertRaisesRegex(ValueError, "diverges"):
            report(self.path, NOW)

    def test_fill_without_source_quote_is_not_accepted(self):
        self.db.execute("DELETE FROM quotes WHERE source_ts IN (SELECT source_ts FROM fills)")
        with self.assertRaisesRegex(ValueError, "recorded quote"):
            report(self.path, NOW)

    def test_poisoned_fill_price_is_rejected(self):
        self.db.execute("UPDATE fills SET price='99999'")
        with self.assertRaisesRegex(ValueError, "diverges"):
            report(self.path, NOW)

    def test_stale_mark_cannot_claim_unrealized_result(self):
        # Stop after a BUY while units remain held.
        self.db.execute("DELETE FROM fills")
        self.db.execute("DELETE FROM quotes")
        self.db.execute(
            "UPDATE strategies SET cash_paise=initial_paise,units='0',pending='',seen_ts=0"
        )
        for i, price in enumerate([100, 101, 102, 103]):
            ts = NOW + i * 10
            ingest(
                self.db,
                [
                    {"symbol": s, "timestamp": ts, "bid": str(price), "ask": str(price + 0.1)}
                    for s in ("BTCINR", "ETHINR")
                ],
                ts,
            )
        account = report(self.path, NOW + 200)["accounts"][0]
        self.assertGreater(float(account["units"]), 0)
        self.assertIsNone(account["unrealizedPnlINR"])
        self.assertIsNone(account["netPnlINR"])
        self.assertFalse(account["markFresh"])

    def test_controls_require_owner_local_enablement(self):
        with self.assertRaises(PermissionError):
            set_active(self.path, "btc-sma", False, "request-1234567890")

    def test_repeated_pause_is_durable_and_never_creates_fills(self):
        before = self.db.execute("SELECT COUNT(*) FROM fills").fetchone()[0]
        a = set_active(self.path, "btc-sma", False, "request-1234567890", authorized=True)
        b = set_active(self.path, "btc-sma", False, "request-1234567890", authorized=True)
        self.assertEqual(a, b)
        self.assertEqual(
            self.db.execute("SELECT active,pending FROM strategies").fetchone()[:], (0, "")
        )
        self.assertEqual(before, self.db.execute("SELECT COUNT(*) FROM fills").fetchone()[0])
        with self.assertRaisesRegex(ValueError, "another command"):
            set_active(self.path, "btc-sma", True, "request-1234567890", authorized=True)
        self.assertFalse(report(self.path, NOW)["accounts"][0]["active"])

    def test_risk_guard_pauses_loss_and_cannot_fabricate_exit_or_be_resumed(self):
        from atlas.runtime.risk_guard import enforce

        self.db.execute("DELETE FROM fills")
        self.db.execute("DELETE FROM quotes")
        self.db.execute(
            "UPDATE strategies SET cash_paise=initial_paise,units='0',"
            "pending='',seen_ts=0,allocation_bps=10000"
        )
        for i, price in enumerate([100, 101, 102, 103, 50]):
            ts = NOW + i * 10
            ingest(
                self.db,
                [
                    {"symbol": m, "timestamp": ts, "bid": str(price), "ask": str(price + 0.1)}
                    for m in ("BTCINR", "ETHINR")
                ],
                ts,
            )
        before = self.db.execute("SELECT COUNT(*) FROM fills").fetchone()[0]
        result = enforce(self.path, NOW + 41)
        self.assertEqual(result["halted"], ["btc-sma"])
        self.assertFalse(result["modeledPositionsLiquidated"])
        self.assertEqual(before, self.db.execute("SELECT COUNT(*) FROM fills").fetchone()[0])
        self.assertFalse(report(self.path, NOW + 41)["accounts"][0]["active"])
        with self.assertRaises(PermissionError):
            set_active(self.path, "btc-sma", True, "request-resume123456", authorized=True)
        self.assertEqual(enforce(self.path, NOW + 41)["halted"], ["btc-sma"])

    def test_monthly_totals_preserve_daily_accounting(self):
        account = report(self.path, NOW)["accounts"][0]
        self.assertEqual(len(account["monthly"]), 1)
        month = account["monthly"][0]
        self.assertAlmostEqual(month["feesINR"], account["feesINR"])
        self.assertAlmostEqual(month["realizedPnlINR"], account["realizedPnlINR"])
        self.assertEqual(month["buys"] + month["sells"], account["paperFills"])
        self.assertFalse(month["completeMonthCoverageVerified"])

    def test_ist_day_query_has_verified_records_and_bounded_pages(self):
        from datetime import datetime
        from unittest.mock import patch
        from zoneinfo import ZoneInfo

        date = datetime.fromtimestamp(NOW, ZoneInfo("Asia/Kolkata")).date().isoformat()
        before = self.db.execute("SELECT COUNT(*) FROM fills").fetchone()[0]
        with patch("atlas.runtime.local_ledger.time.time", return_value=NOW):
            result = trade_day(self.path, "btc-sma", date)
            empty = trade_day(self.path, "btc-sma", date, 100)
            self.assertEqual(result["totalEvents"], before)
            self.assertEqual(len(result["events"]), before)
            self.assertTrue(result["accountingVerified"])
            self.assertFalse(result["realOrdersEnabled"])
            self.assertIsNone(result["nextOffset"])
            self.assertEqual(empty["events"], [])
            for identity, date_value, offset in [
                ("../btc-sma", date, 0),
                ("unknown", date, 0),
                ("btc-sma", "2026-1-1", 0),
                ("btc-sma", date, -1),
                ("btc-sma", date, True),
                ("btc-sma", date, 1_000_001),
            ]:
                with self.assertRaises(ValueError):
                    trade_day(self.path, identity, date_value, offset)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM fills").fetchone()[0], before)

    def test_unsafe_or_unknown_ids_and_paths_are_rejected(self):
        for name in ["../btc-sma", "x;DROP TABLE fills", "no-such-strategy"]:
            with self.assertRaises(ValueError):
                set_active(self.path, name, True, "request-1234567890", authorized=True)
        with self.assertRaises(ValueError):
            report(self.path.with_name("missing.sqlite3"), NOW)
        symlink = self.path.with_name("alias.sqlite3")
        symlink.symlink_to(self.path)
        with self.assertRaises(ValueError):
            report(symlink, NOW)


if __name__ == "__main__":
    unittest.main()
