import unittest
from decimal import Decimal

from atlas.broker import ApprovedOrder, BrokerOrderStatus, DisabledBrokerAdapter, OrderSide


class BrokerBoundaryTests(unittest.TestCase):
    def test_approved_order_requires_governance_provenance_and_idempotency(self):
        with self.assertRaises(ValueError):
            ApprovedOrder("NSE:TCS", 10).validate()
        order = ApprovedOrder("NSE:TCS", 10, Decimal("100"), "approval-1", "idem-1", OrderSide.BUY)
        order.validate()

    def test_disabled_adapter_fails_closed(self):
        adapter = DisabledBrokerAdapter()
        order = ApprovedOrder("NSE:TCS", 1, approval_id="a", idempotency_key="i")
        with self.assertRaises(RuntimeError):
            adapter.submit(order)
        with self.assertRaises(RuntimeError):
            adapter.reconcile()

    def test_order_status_has_ambiguous_terminal_state(self):
        self.assertEqual(BrokerOrderStatus.UNKNOWN.value, "unknown")


if __name__ == "__main__":
    unittest.main()
