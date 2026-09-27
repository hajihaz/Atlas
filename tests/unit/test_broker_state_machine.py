import unittest

from atlas.broker.adapter import BrokerOrderStatus as S
from atlas.broker.state_machine import validate_transition


class BrokerStateMachineTests(unittest.TestCase):
    def test_normal_partial_fill_progression(self):
        validate_transition(S.UNKNOWN, S.ACCEPTED)
        validate_transition(S.ACCEPTED, S.PARTIALLY_FILLED)
        validate_transition(S.PARTIALLY_FILLED, S.FILLED)
        validate_transition(S.FILLED, S.FILLED)

    def test_terminal_state_cannot_regress(self):
        for terminal in (S.FILLED, S.CANCELLED, S.REJECTED):
            with self.assertRaises(RuntimeError):
                validate_transition(terminal, S.ACCEPTED)
