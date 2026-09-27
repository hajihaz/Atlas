import unittest
from decimal import Decimal

from atlas.broker.adapter import BrokerOrderStatus, OrderSide
from atlas.broker.upstox_reconcile import (
    deduplicate_trades,
    map_order,
    map_order_status,
    parse_trade,
)


class UpstoxReconcileTests(unittest.TestCase):
    def test_status_mapping_is_fail_closed(self):
        self.assertEqual(map_order_status("complete"), BrokerOrderStatus.FILLED)
        self.assertEqual(map_order_status("partially filled"), BrokerOrderStatus.PARTIALLY_FILLED)
        self.assertEqual(map_order_status("something-new"), BrokerOrderStatus.UNKNOWN)

    def test_order_mapping_preserves_client_correlation(self):
        r = map_order({"order_id": "o1", "tag": "idem-1", "status": "complete"})
        self.assertEqual(
            (r.client_order_id, r.broker_order_id, r.status),
            ("idem-1", "o1", BrokerOrderStatus.FILLED),
        )

    def test_malformed_trade_is_discarded(self):
        self.assertIsNone(parse_trade({"order_id": "o1"}))

    def test_trade_parsing_and_duplicate_suppression(self):
        raw = {
            "trade_id": "t1",
            "order_id": "o1",
            "instrument_token": "NSE_EQ|x",
            "quantity": 5,
            "average_price": "100.25",
            "fees": "1.50",
            "transaction_type": "BUY",
        }
        t = parse_trade(raw)
        self.assertEqual(t.side, OrderSide.BUY)
        self.assertEqual(t.fill_price, Decimal("100.25"))
        self.assertEqual(len(deduplicate_trades([t, t])), 1)


if __name__ == "__main__":
    unittest.main()
