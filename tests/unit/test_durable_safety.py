import tempfile
import unittest
from pathlib import Path

from atlas.emergency import EmergencyControl
from atlas.monitoring import HealthReport


class DurableSafetyTests(unittest.TestCase):
    def test_kill_switch_survives_restart(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "halt.json"
            e = EmergencyControl(state_path=p)
            e.engage()
            recovered = EmergencyControl.recover(p)
            self.assertTrue(recovered.kill_switch)
            with self.assertRaises(RuntimeError):
                recovered.assert_clear()

    def test_corrupt_emergency_state_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "halt.json"
            p.write_text("{bad")
            self.assertTrue(EmergencyControl.recover(p).halted)

    def test_unhealthy_monitoring_blocks(self):
        h = HealthReport(reconciliation_healthy=False)
        self.assertFalse(h.healthy)
        with self.assertRaises(RuntimeError):
            h.assert_healthy()
