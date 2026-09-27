import datetime as dt
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from atlas.execution.ledger import ExecutionEvent, ExecutionLedger
from atlas.execution.persistence import DurableExecutionLedgerStore


class ExecutionPersistenceTests(unittest.TestCase):
    def test_round_trip_and_restart_integrity(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "ledger.json"
            ledger = ExecutionLedger()
            ledger.append(
                ExecutionEvent(
                    "t1",
                    "broker_fill",
                    dt.datetime.now(dt.UTC),
                    "ABC",
                    2,
                    Decimal("10"),
                    Decimal("1"),
                    Decimal("79"),
                    Decimal("99"),
                )
            )
            store = DurableExecutionLedgerStore(path)
            store.save(ledger)
            restored = store.load()
            self.assertEqual(restored.head_checkpoint(), ledger.head_checkpoint())
            restored.verify_integrity()
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_corruption_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "ledger.json"
            ledger = ExecutionLedger()
            ledger.append(ExecutionEvent("x", "decision", dt.datetime.now(dt.UTC)))
            store = DurableExecutionLedgerStore(path)
            store.save(ledger)
            path.write_text(path.read_text().replace('"event_id":"x"', '"event_id":"tampered"'))
            with self.assertRaises(RuntimeError):
                store.load()


if __name__ == "__main__":
    unittest.main()
