import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from scripts.install_owner_runtime import bootstrap_agent


class OwnerBootstrapTests(unittest.TestCase):
    def test_transient_reaping_error_has_a_bounded_recovery(self):
        results = [SimpleNamespace(returncode=5), SimpleNamespace(returncode=0)]
        with patch("scripts.install_owner_runtime.subprocess.run", side_effect=results) as run:
            with patch("scripts.install_owner_runtime.time.sleep") as sleep:
                bootstrap_agent("gui/501", Path("/fixture/owner.plist"))
        self.assertEqual(run.call_count, 2)
        sleep.assert_called_once_with(0.25)

    def test_permanent_or_repeated_errors_do_not_loop_or_claim_success(self):
        for code, calls in [(6, 1), (5, 3)]:
            with self.subTest(code=code):
                with patch(
                    "scripts.install_owner_runtime.subprocess.run",
                    return_value=SimpleNamespace(returncode=code),
                ) as run:
                    with patch("scripts.install_owner_runtime.time.sleep"):
                        with self.assertRaises(RuntimeError):
                            bootstrap_agent("gui/501", Path("/fixture/owner.plist"))
                self.assertEqual(run.call_count, calls)
