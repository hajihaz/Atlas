from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from atlas.paper.live_runner import add_strategy, connect
from atlas.runtime import observer


class ObserverHealthTests(unittest.TestCase):
    def test_verified_accounting_does_not_claim_live_data_without_quotes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "paper.sqlite3"
            db = connect(source)
            add_strategy(db, id="fixture-paper", symbol="BTCINR", kind="sma", fast=2, slow=3)
            db.close()
            with (
                patch.object(observer, "STATE", root / "state"),
                patch.dict(
                    "os.environ",
                    {"ATLAS_PAPER_DB_PATH": str(source), "ATLAS_PAPER_RISK_GUARD": "0"},
                ),
                patch(
                    "atlas.runtime.analytics.observed_daily_drawdown",
                    return_value={"scope": "isolated metric boundary"},
                ),
            ):
                health = observer.observe()
            self.assertEqual(health["status"], "accounting_verified_source_stale")
            self.assertTrue(health["accountingVerified"])
            self.assertFalse(health["sourceFresh"])
            self.assertFalse(health["realOrdersEnabled"])
            saved = json.loads((root / "state/mac-paper-report.json").read_text())
            self.assertEqual(saved["accounts"][0]["paperFills"], 0)

    def test_missing_source_cannot_leave_verified_health_or_create_a_ledger(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "missing.sqlite3"
            with (
                patch.object(observer, "STATE", root / "state"),
                patch.dict(
                    "os.environ",
                    {"ATLAS_PAPER_DB_PATH": str(source), "ATLAS_PAPER_RISK_GUARD": "0"},
                ),
            ):
                health = observer.observe()
            self.assertEqual(health["status"], "accounting_or_source_unavailable")
            self.assertFalse(source.exists())
            self.assertFalse((root / "state/mac-paper-report.json").exists())
            saved = json.loads((root / "state/observer-status.json").read_text())
            self.assertEqual(saved["status"], health["status"])


if __name__ == "__main__":
    unittest.main()
