"""Network latency must not make an actually recent source event look future-dated."""

import json
import unittest
from unittest.mock import patch

from scripts.atlas_public_quote_source import fetch_quotes


class ReceiptClockTests(unittest.TestCase):
    def response(self, timestamp, clock):
        rows = [
            {
                "market": symbol,
                "timestamp": timestamp,
                "bid": "100",
                "ask": "101",
                "last_price": "100",
            }
            for symbol in ["BTCINR", "ETHINR"]
        ]

        class Response:
            status = 200

            def __enter__(self):
                clock["now"] = 111
                return self

            def __exit__(self, *args):
                return False

            def read(self, size):
                return json.dumps(rows).encode()

        return Response()

    def test_slow_response_uses_receipt_clock_without_rewriting_source_time(self):
        clock = {"now": 100}
        with patch("scripts.atlas_public_quote_source.time.time", lambda clock=clock: clock["now"]):
            with patch(
                "scripts.atlas_public_quote_source.urllib.request.urlopen",
                return_value=self.response(110, clock),
            ):
                observed = fetch_quotes()
        self.assertEqual([q["timestamp"] for q in observed], [110, 110])

    def test_receipt_clock_still_rejects_truly_stale_or_future_sources(self):
        for timestamp in [20, 117]:
            with self.subTest(timestamp=timestamp):
                clock = {"now": 100}
                with patch(
                    "scripts.atlas_public_quote_source.time.time", lambda clock=clock: clock["now"]
                ):
                    with patch(
                        "scripts.atlas_public_quote_source.urllib.request.urlopen",
                        return_value=self.response(timestamp, clock),
                    ):
                        with self.assertRaisesRegex(ValueError, "stale/future"):
                            fetch_quotes()
