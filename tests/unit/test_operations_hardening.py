import json
import os
import tempfile
import unittest
from pathlib import Path

from atlas.operations_hardening import AppliedEventStore, DurableEmergencyStore


class OperationsHardeningTests(unittest.TestCase):
    def test_applied_event_registry_survives_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "events.json"
            AppliedEventStore(path).save({"trade-2", "trade-1"})
            self.assertEqual(AppliedEventStore(path).load(), {"trade-1", "trade-2"})
            self.assertEqual(os.stat(path).st_mode & 0o077, 0)

    def test_registry_corruption_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "events.json"
            path.write_text("{bad", encoding="utf-8")
            os.chmod(path, 0o600)
            with self.assertRaises(RuntimeError):
                AppliedEventStore(path).load()

    def test_emergency_state_survives_restart_and_is_integrity_checked(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "halt.json"
            first = DurableEmergencyStore(path)
            first.engage("reconciliation mismatch")
            with self.assertRaises(RuntimeError):
                DurableEmergencyStore(path).assert_clear()
            DurableEmergencyStore(path).clear("operator-reviewed paper environment")
            DurableEmergencyStore(path).assert_clear()
            data = json.loads(path.read_text(encoding="utf-8"))
            data["generation"] = 999
            path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaises(RuntimeError):
                DurableEmergencyStore(path).load()
