"""SQLite settlement invariants for the Cloudflare D1 free-tier paper engine.

These are synthetic ledger fixtures, never actual market observations.
"""
from __future__ import annotations

import sqlite3
import unittest
from pathlib import Path

SCHEMA = (
    Path(__file__).resolve().parents[2]
    / "deployments/cloudflare-paper/schema.sql"
).read_text(encoding="utf-8")


class D1SettlementTriggerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(SCHEMA)
        self.db.execute(
            """INSERT INTO quotes(
              symbol,price_paise,cumulative_volume,observed_ms,source,exchange_open)
              VALUES('INFY',15500,100000,1000,'SYNTHETIC_TEST_ONLY',1)"""
        )

    def tearDown(self) -> None:
        self.db.close()

    def order(self, oid: str, symbol: str, side: str, qty: int, kind: str) -> None:
        self.db.execute(
            """INSERT INTO orders(id,client_key,kind,symbol,side,qty,due_ms,created_ms)
              VALUES(?,?,?,?,?,?,1000,1000)""",
            (oid, oid + "-key", kind, symbol, side, qty),
        )

    def settle(self, oid: str, price: int, fee: int) -> None:
        self.db.execute(
            """UPDATE orders SET status='FILLED',fill_paise=?,fee_paise=?,
               completed_ms=2000,execution_id=?
               WHERE id=? AND status='QUEUED'""",
            (price, fee, "execution-" + oid, oid),
        )

    def scalar(self, sql: str) -> int:
        return self.db.execute(sql).fetchone()[0]

    def test_buy_exactly_one_settlement_on_replay(self) -> None:
        self.order("buy-1", "INFY", "BUY", 3, "MANUAL")
        self.settle("buy-1", 15508, 47)
        expected = 10_000_000 - (3 * 15508 + 47)
        self.assertEqual(self.scalar("SELECT cash_paise FROM account"), expected)
        self.assertEqual(self.scalar("SELECT qty FROM positions WHERE symbol='INFY'"), 3)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM events WHERE type='PAPER_FILL'"), 1)
        self.settle("buy-1", 15508, 47)
        self.assertEqual(self.scalar("SELECT cash_paise FROM account"), expected)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM events WHERE type='PAPER_FILL'"), 1)

    def test_paper_short_and_cover_restore_position(self) -> None:
        self.order("sell-1", "INFY", "SELL", 2, "ENTRY")
        self.settle("sell-1", 10000, 20)
        self.assertEqual(self.scalar("SELECT qty FROM positions WHERE symbol='INFY'"), -2)
        self.assertEqual(self.scalar("SELECT intraday FROM positions WHERE symbol='INFY'"), 1)
        self.order("cover-1", "INFY", "BUY", 2, "EXIT")
        self.settle("cover-1", 10100, 20)
        self.assertEqual(self.scalar("SELECT qty FROM positions WHERE symbol='INFY'"), 0)
        self.assertEqual(self.scalar("SELECT intraday FROM positions WHERE symbol='INFY'"), 0)
        self.assertEqual(self.scalar("SELECT cash_paise FROM account"),
                         10_000_000 + (2 * 10000 - 20) - (2 * 10100 + 20))
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM events WHERE type='PAPER_FILL'"), 2)

    def test_insufficient_virtual_cash_rolls_back_transaction(self) -> None:
        self.order("huge-1", "INFY", "BUY", 100000, "MANUAL")
        with self.assertRaises(sqlite3.IntegrityError):
            self.settle("huge-1", 15508, 155080)
        self.assertEqual(self.scalar("SELECT cash_paise FROM account"), 10_000_000)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM positions"), 0)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM events"), 0)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM orders WHERE status='FILLED'"), 0)


if __name__ == "__main__":
    unittest.main()
