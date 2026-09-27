import tempfile
import unittest
from pathlib import Path

from atlas.operations import DurableState, SandboxSession, StateStore


class T(unittest.TestCase):
    def test_state_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "state.json"
            s = DurableState(1, "s", "paper", (2, "h"))
            StateStore(p).save(s)
            self.assertEqual(StateStore(p).load(), s)

    def test_sandbox_session_isolated(self):
        self.assertEqual(SandboxSession.start().environment, "upstox-sandbox")


class StateStoreSecurityTests(unittest.TestCase):
    def test_checkpoint_is_private(self):
        import stat

        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "state.json"
            StateStore(p).save(DurableState(1, "s", "paper", (0, "h")))
            self.assertEqual(stat.S_IMODE(p.stat().st_mode), 0o600)

    def test_corrupt_checkpoint_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "state.json"
            p.write_text("not-json")
            with self.assertRaises(RuntimeError):
                StateStore(p).load()
