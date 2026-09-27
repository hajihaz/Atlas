import json
import os
import tempfile
import unittest
from pathlib import Path

from atlas.operations_hardening import AppliedEventStore, DurableEmergencyStore


class CrashRecoveryChaosTests(unittest.TestCase):
    def test_truncated_applied_event_state_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "events.json"
            AppliedEventStore(path).save({"a", "b"})
            path.write_text(path.read_text()[:7], encoding="utf-8")
            with self.assertRaises(RuntimeError):
                AppliedEventStore(path).load()

    def test_emergency_tamper_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "halt.json"
            store = DurableEmergencyStore(path)
            store.engage("test halt")
            raw = json.loads(path.read_text())
            raw["engaged"] = False
            path.write_text(json.dumps(raw))
            os.chmod(path, 0o600)
            with self.assertRaises(RuntimeError):
                DurableEmergencyStore(path).load()
