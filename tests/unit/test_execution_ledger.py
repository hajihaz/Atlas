import datetime as dt
import unittest
from decimal import Decimal

from atlas.execution.ledger import ExecutionEvent, ExecutionLedger


class ExecutionLedgerTests(unittest.TestCase):
    def test_append_is_hash_chained_and_checkpointable(self):
        ledger = ExecutionLedger()
        t = dt.datetime(2026, 9, 3, tzinfo=dt.UTC)
        a = ledger.append(
            ExecutionEvent("e1", "order_intent", t, "SPY", 10, Decimal("100"), decision_id="d1")
        )
        ledger.append(
            ExecutionEvent(
                "e2", "fill", t, "SPY", 10, Decimal("101"), Decimal("0.1"), decision_id="d1"
            )
        )
        ledger.verify_integrity()
        self.assertEqual(a.seq, 0)
        self.assertEqual(ledger.head_checkpoint()[0], 1)
        ledger.verify_integrity(ledger.head_checkpoint())

    def test_tampering_is_detected(self):
        ledger = ExecutionLedger()
        t = dt.datetime(2026, 9, 3, tzinfo=dt.UTC)
        ledger.append(ExecutionEvent("e1", "fill", t, "SPY", 10, Decimal("100")))
        object.__setattr__(
            ledger._entries[0], "event", ExecutionEvent("e1", "fill", t, "SPY", 11, Decimal("100"))
        )
        with self.assertRaises(ValueError):
            ledger.verify_integrity()

    def test_invalid_event_is_rejected(self):
        ledger = ExecutionLedger()
        t = dt.datetime(2026, 9, 3, tzinfo=dt.UTC)
        with self.assertRaises(ValueError):
            ledger.append(ExecutionEvent("", "fill", t))
        with self.assertRaises(ValueError):
            ledger.append(ExecutionEvent("e", "fill", t, quantity=0))


if __name__ == "__main__":
    unittest.main()
