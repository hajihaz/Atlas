"""Optional tool acceptance; synthetic fixtures exercise mechanics only."""

import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.research_tools_audit import bt_replay, duckdb_audit, read_snapshot, validation_plan


class ReadOnlyBoundaryTest(unittest.TestCase):
    def test_missing_ledger_does_not_create_a_database(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "missing.sqlite3"
            with self.assertRaises(ValueError):
                read_snapshot(path)
            self.assertFalse(path.exists())

    def test_existing_ledger_remains_read_only_and_symlinks_are_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.sqlite3"
            with sqlite3.connect(path) as db:
                for name in ("strategies", "fills", "quotes"):
                    db.execute(f"CREATE TABLE {name} (a,b)")
                    db.execute(f"INSERT INTO {name} VALUES (1,2)")
            before = path.read_bytes()
            self.assertEqual(len(read_snapshot(path)["fills"]), 1)
            self.assertEqual(path.read_bytes(), before)
            link = Path(directory) / "link"
            link.symlink_to(path)
            with self.assertRaises(ValueError):
                read_snapshot(link)

    def test_insufficient_history_never_becomes_a_profitability_result(self):
        result = validation_plan(7)
        self.assertEqual(result["status"], "INSUFFICIENT_DAILY_HISTORY")
        self.assertIsNone(result["profitable"])
        self.assertIsNone(result["walkForwardResults"])


@unittest.skipUnless(
    all(importlib.util.find_spec(name) for name in ("bt", "duckdb", "skfolio")),
    "Isolated research environment required",
)
class IndependentToolTest(unittest.TestCase):
    def test_fractional_paise_rounding_and_recorded_fees_reconcile(self):
        account = {
            "id": "mechanics-only",
            "initial_paise": 100000,
            "cash_paise": 100297,
            "units": "0",
        }
        fills = [
            {
                "source_ts": 1700000000,
                "side": "BUY",
                "quantity": "3",
                "price": "10.001",
                "fee_paise": 2,
            },
            {
                "source_ts": 1700000010,
                "side": "SELL",
                "quantity": "3",
                "price": "11.004",
                "fee_paise": 2,
            },
        ]
        result = bt_replay(account, fills)
        self.assertEqual(result["differencePaise"], 0)
        self.assertEqual(result["recordedFeesPaise"], 4)
        self.assertEqual(result["notionalRoundingAdjustmentPaise"], "0.100")
        account["cash_paise"] += 10
        with self.assertRaises(ValueError):
            bt_replay(account, fills)

    def test_duckdb_refuses_orphan_source_fills(self):
        snapshot = {
            "strategies": [{"id": "paper", "symbol": "BTCINR"}],
            "fills": [{"strategy_id": "paper", "source_ts": 1, "fee_paise": 3}],
            "quotes": [{"symbol": "BTCINR", "source_ts": 2}],
        }
        with self.assertRaises(ValueError):
            duckdb_audit(snapshot)

    def test_skfolio_walk_forward_purge_mechanics_are_separate_from_results(self):
        result = validation_plan(280)
        self.assertGreater(result["walkForwardFolds"], 0)
        self.assertGreater(result["combinatorialPurgedSplits"], 0)
        self.assertIsNone(result["profitable"])
        self.assertEqual(result["status"], "SPLIT_PLAN_ONLY")


if __name__ == "__main__":
    unittest.main()
