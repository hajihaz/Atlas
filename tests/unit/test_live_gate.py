import unittest

from atlas.governance import LiveGateStatus, LiveReadiness, evaluate_live_readiness


class LiveGateTests(unittest.TestCase):
    def test_default_is_blocked_and_reports_all_missing_gates(self):
        state = LiveReadiness()
        self.assertEqual(state.status, LiveGateStatus.BLOCKED)
        self.assertFalse(state.all_passed)
        self.assertIn("strategy_evidence", state.blockers)
        with self.assertRaises(RuntimeError):
            state.assert_ready()

    def test_partial_readiness_cannot_authorize_live_capital(self):
        state = LiveReadiness(strategy_evidence=True, risk_approved=True)
        self.assertEqual(evaluate_live_readiness(state), state)
        self.assertEqual(state.status, LiveGateStatus.BLOCKED)
        self.assertFalse(state.all_passed)

    def test_only_complete_independent_gate_set_is_ready(self):
        state = LiveReadiness(**{name: True for name in vars(LiveReadiness())})
        self.assertEqual(state.status, LiveGateStatus.READY)
        self.assertEqual(state.blockers, ())
        state.assert_ready()

    def test_gate_never_places_orders_or_changes_state(self):
        state = LiveReadiness(strategy_evidence=True)
        result = evaluate_live_readiness(state)
        self.assertIs(result, state)
        self.assertEqual(state.governance_live_mode, False)


if __name__ == "__main__":
    unittest.main()
