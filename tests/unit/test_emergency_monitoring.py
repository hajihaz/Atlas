import unittest

from atlas.emergency import EmergencyControl
from atlas.monitoring import Severity, reconciliation_alert


class T(unittest.TestCase):
    def test_kill_is_terminal(self):
        c = EmergencyControl()
        c.engage()
        self.assertTrue(c.kill_switch)
        self.assertRaises(RuntimeError, c.assert_clear)

    def test_alert_is_critical(self):
        self.assertEqual(reconciliation_alert("x", "y").severity, Severity.CRITICAL)
