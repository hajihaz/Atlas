import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from atlas.broker.upstox_sandbox import SANDBOX_BASE_URL
from atlas.broker.upstox_transport import (
    TransportAuthError,
    TransportError,
    TransportResponseError,
    TransportRetryableError,
    UpstoxSandboxHttpTransport,
)


class UpstoxSandboxTransportTests(unittest.TestCase):
    def test_refuses_non_sandbox_url(self):
        t = UpstoxSandboxHttpTransport("token")
        with self.assertRaises(TransportError):
            t(url="https://api.upstox.com/v2/order/place", access_token="token", payload={})

    def test_refuses_token_mismatch(self):
        t = UpstoxSandboxHttpTransport("secret")
        with self.assertRaises(TransportAuthError):
            t(url=SANDBOX_BASE_URL + "/v2/order/place", access_token="other", payload={})

    @patch("atlas.broker.upstox_transport.urlopen")
    def test_does_not_expose_token_in_request_payload(self, mock_urlopen):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def read(self):
                return b'{"status":"success","data":{"order_id":"o1"}}'

        mock_urlopen.return_value = Response()
        t = UpstoxSandboxHttpTransport("secret-token")
        result = t(
            url=SANDBOX_BASE_URL + "/v2/order/place",
            access_token="secret-token",
            payload={"tag": "idem"},
        )
        self.assertEqual(result["data"]["order_id"], "o1")
        request = mock_urlopen.call_args.args[0]
        self.assertNotIn(b"secret-token", request.data)
        self.assertIn("Bearer secret-token", request.headers["Authorization"])

    @patch("atlas.broker.upstox_transport.urlopen", side_effect=URLError("offline"))
    def test_network_failure_is_retryable(self, _):
        t = UpstoxSandboxHttpTransport("token")
        with self.assertRaises(TransportRetryableError):
            t(url=SANDBOX_BASE_URL + "/v2/order/place", access_token="token", payload={})

    @patch("atlas.broker.upstox_transport.urlopen")
    def test_server_failure_is_retryable(self, mock_urlopen):
        mock_urlopen.side_effect = HTTPError("x", 503, "busy", {}, None)
        t = UpstoxSandboxHttpTransport("token")
        with self.assertRaises(TransportRetryableError):
            t(url=SANDBOX_BASE_URL + "/v2/order/place", access_token="token", payload={})

    @patch("atlas.broker.upstox_transport.urlopen")
    def test_malformed_json_is_response_error(self, mock_urlopen):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def read(self):
                return b"not-json"

        mock_urlopen.return_value = Response()
        t = UpstoxSandboxHttpTransport("token")
        with self.assertRaises(TransportResponseError):
            t(url=SANDBOX_BASE_URL + "/v2/order/place", access_token="token", payload={})


if __name__ == "__main__":
    unittest.main()
