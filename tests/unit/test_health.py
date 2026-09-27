import unittest

from atlas.health import HealthSignal, HealthStatus, evaluate_health


class HealthTests(unittest.TestCase):
    def test_empty_health_is_blocked(self):
        report = evaluate_health(())
        self.assertEqual(report.status, HealthStatus.BLOCKED)

    def test_capital_blocking_signal_fails_closed(self):
        report = evaluate_health(
            (
                HealthSignal("market_data", True),
                HealthSignal("reconciliation", False, "cash mismatch"),
            )
        )
        self.assertEqual(report.status, HealthStatus.BLOCKED)
        with self.assertRaises(RuntimeError):
            report.assert_capital_safe()

    def test_nonblocking_signal_degrades_only(self):
        report = evaluate_health((HealthSignal("reporting", False, capital_blocking=False),))
        self.assertEqual(report.status, HealthStatus.DEGRADED)
        report.assert_capital_safe()
