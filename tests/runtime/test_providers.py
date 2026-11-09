import unittest

from atlas.runtime.providers import KrakenPublicTrades, UpstoxReadOnly


class FakeSdk:
    def __init__(self):
        self.calls = []

    def call_api(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return {"status": "success", "data": []}


class ProviderTests(unittest.TestCase):
    def test_rights_and_missing_token_fail_before_transport(self):
        sdk = FakeSdk()
        with self.assertRaises(PermissionError):
            UpstoxReadOnly("x" * 30, rights_approved=False, client=sdk)
        with self.assertRaises(ValueError):
            UpstoxReadOnly("", rights_approved=True, client=sdk)
        self.assertEqual(sdk.calls, [])

    def test_only_fixed_get_routes_reach_official_sdk(self):
        sdk = FakeSdk()
        c = UpstoxReadOnly("x" * 30, rights_approved=True, client=sdk)
        c.quotes(["NSE_EQ|INE002A01018"])
        c.minute_history("NSE_EQ|INE002A01018", "2026-09-18", "2026-10-15")
        c.ipos()
        c.ipo_details("example-industries-ipo")
        self.assertEqual(len(sdk.calls), 4)
        self.assertTrue(all(args[1] == "GET" for args, _ in sdk.calls))
        self.assertTrue(all(args[0].startswith(("/v2/", "/v3/")) for args, _ in sdk.calls))
        self.assertTrue(all(kwargs["_request_timeout"] == (3, 8) for _, kwargs in sdk.calls))

    def test_injection_unbounded_dates_and_order_filter_cannot_reach_network(self):
        sdk = FakeSdk()
        c = UpstoxReadOnly("x" * 30, rights_approved=True, client=sdk)
        for action in [
            lambda: c.quotes(["https://evil.test"]),
            lambda: c.ipo_details("../../orders"),
            lambda: c.ipos(stage="place_order"),
            lambda: c.minute_history("NSE_EQ|INE002A01018", "2026-01-01", "2026-12-31"),
        ]:
            with self.assertRaises(ValueError):
                action()
        self.assertEqual(sdk.calls, [])

    def test_ccxt_observation_never_changes_usd_to_inr(self):
        class Exchange:
            def fetch_trades(self, symbol, limit):
                return [{"price": 100, "timestamp": 100000}]

        p = KrakenPublicTrades(Exchange())
        value = p.last_trade("BTC/USD", 100001)
        self.assertEqual(value["currency"], "USD")
        self.assertFalse(value["inrConversionApplied"])
        self.assertFalse(value["paperExecutionEnabled"])
        with self.assertRaises(ValueError):
            p.last_trade("BTC/USD", 200000)
        with self.assertRaises(ValueError):
            p.last_trade("BTC/INR", 100001)


if __name__ == "__main__":
    unittest.main()
