import unittest
from dataclasses import replace

from atlas.governance.live_gate import LiveGateStatus, LiveReadiness


class LiveGateAdversarialTests(unittest.TestCase):
    def test_every_single_missing_gate_blocks(self):
        ready = LiveReadiness(**{name: True for name in LiveReadiness.__dataclass_fields__})
        self.assertEqual(ready.status, LiveGateStatus.READY)
        for name in LiveReadiness.__dataclass_fields__:
            candidate = replace(ready, **{name: False})
            self.assertEqual(candidate.status, LiveGateStatus.BLOCKED, name)
            self.assertIn(name, candidate.blockers)
            with self.assertRaises(RuntimeError):
                candidate.assert_ready()

    def test_default_state_cannot_be_ready(self):
        state = LiveReadiness()
        self.assertEqual(state.status, LiveGateStatus.BLOCKED)
        self.assertFalse(state.all_passed)
