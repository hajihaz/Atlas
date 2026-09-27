import unittest
from decimal import Decimal

from atlas.broker import ApprovedOrder, OrderSide
from atlas.broker.upstox_sandbox import (
    PLACE_ORDER_PATH,
    SANDBOX_BASE_URL,
    UpstoxSandboxAdapter,
    UpstoxSandboxConfig,
)


class UpstoxSandboxTests(unittest.TestCase):
    def test_translates_only_to_fixed_sandbox_endpoint(self):
        seen = {}

        def transport(**kwargs):
            seen.update(kwargs)
            return {"data": {"order_id": "sandbox-123"}}

        adapter = UpstoxSandboxAdapter(
            UpstoxSandboxConfig("runtime-token", {"NSE:TCS": "NSE_EQ|INE467B01029"}), transport
        )
        receipt = adapter.submit(
            ApprovedOrder("NSE:TCS", 10, Decimal("100"), "approval-1", "idem-1", OrderSide.BUY)
        )
        self.assertEqual(receipt.broker_order_id, "sandbox-123")
        self.assertEqual(seen["url"], SANDBOX_BASE_URL + PLACE_ORDER_PATH)
        self.assertEqual(seen["access_token"], "runtime-token")
        self.assertEqual(seen["payload"]["transaction_type"], "BUY")
        self.assertEqual(seen["payload"]["tag"], "idem-1")

    def test_missing_mapping_fails_closed(self):
        adapter = UpstoxSandboxAdapter(
            UpstoxSandboxConfig("token", {"NSE:INFY": "x"}), lambda **_: {}
        )
        with self.assertRaises(ValueError):
            adapter.submit(
                ApprovedOrder(
                    "NSE:TCS", 1, approval_id="a", idempotency_key="i", side=OrderSide.BUY
                )
            )

    def test_ambiguous_provider_response_is_unknown(self):
        adapter = UpstoxSandboxAdapter(
            UpstoxSandboxConfig("token", {"NSE:TCS": "x"}), lambda **_: {"data": {}}
        )
        receipt = adapter.submit(
            ApprovedOrder("NSE:TCS", 1, approval_id="a", idempotency_key="i", side=OrderSide.SELL)
        )
        self.assertIsNone(receipt.broker_order_id)
        self.assertEqual(receipt.status.value, "unknown")

    def test_reconcile_never_fabricates_fills(self):
        adapter = UpstoxSandboxAdapter(
            UpstoxSandboxConfig("token", {"NSE:TCS": "x"}), lambda **_: {}
        )
        self.assertEqual(adapter.reconcile(), ())


if __name__ == "__main__":
    unittest.main()
