import os
import unittest
from unittest.mock import patch

from atlas.broker.sandbox_runtime import ENV_TOKEN, SandboxRuntimeConfig, load_sandbox_adapter


class SandboxRuntimeTests(unittest.TestCase):
    def test_token_is_required_from_environment(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, ENV_TOKEN):
                load_sandbox_adapter(SandboxRuntimeConfig({"NSE:TCS": "token-map"}))

    def test_token_is_not_persisted_in_runtime_config(self):
        with patch.dict(os.environ, {ENV_TOKEN: "runtime-secret"}, clear=True):
            adapter = load_sandbox_adapter(SandboxRuntimeConfig({"NSE:TCS": "token-map"}))
            self.assertNotIn("runtime-secret", repr(adapter._config))


if __name__ == "__main__":
    unittest.main()
