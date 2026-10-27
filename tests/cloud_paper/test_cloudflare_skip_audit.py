"""Cloudflare D1 skip transitions are idempotent under retry/races (synthetic only)."""

import sqlite3
import unittest
from pathlib import Path

SCHEMA = (
    Path(__file__).resolve().parents[2] / "deployments/cloudflare-paper/schema.sql"
).read_text()


class SkipAuditAtomicityTests(unittest.TestCase):
    def test_parallel_skip_attempts_log_once(self):
        with sqlite3.connect(":memory:") as db:
            db.executescript(SCHEMA)
            db.execute("""INSERT INTO orders(id,client_key,kind,symbol,side,qty,due_ms,created_ms)
                          VALUES('miss-1','synthetic_test_key','MANUAL','INFY','BUY',2,1000,1000)""")
            for _ in range(3):
                db.execute("""UPDATE orders SET status='SKIPPED',completed_ms=2000,
                             reason='SCHEDULE_MISSED_NO_BACKFILL'
                             WHERE id='miss-1' AND status='QUEUED'""")
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM events WHERE type='SKIP'").fetchone()[0], 1
            )
            self.assertEqual(
                db.execute("SELECT status FROM orders WHERE id='miss-1'").fetchone()[0], "SKIPPED"
            )
            self.assertEqual(
                db.execute("SELECT cash_paise FROM account WHERE id=1").fetchone()[0], 10000000
            )
            self.assertEqual(db.execute("SELECT COUNT(*) FROM positions").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
