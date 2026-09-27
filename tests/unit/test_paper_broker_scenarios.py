import unittest
from decimal import Decimal

from atlas.broker.adapter import ApprovedOrder, BrokerOrderStatus, OrderSide
from atlas.paper.broker_simulator import DeterministicPaperBroker, PaperBrokerConfig


def order(quantity=10):
    return ApprovedOrder(
        "A", quantity, approval_id="paper", idempotency_key="k", side=OrderSide.BUY
    )


class PaperBrokerScenarioTests(unittest.TestCase):
    def test_partial_fill_costs_and_idempotency(self):
        broker = DeterministicPaperBroker(
            {"A": Decimal("100")},
            PaperBrokerConfig(
                fee_bps=Decimal("10"),
                slippage_bps=Decimal("5"),
                fill_fraction=Decimal("0.5"),
            ),
        )
        first = broker.submit(order())
        second = broker.submit(order())
        self.assertEqual(first, second)
        self.assertEqual(first.status, BrokerOrderStatus.PARTIALLY_FILLED)
        fill = broker.reconcile()[0]
        self.assertEqual(fill.quantity, 5)
        self.assertGreater(fill.fill_price, Decimal("100"))
        self.assertGreater(fill.fee, 0)

    def test_rejection_produces_no_fill(self):
        broker = DeterministicPaperBroker(
            {"A": Decimal("100")},
            PaperBrokerConfig(reject_instruments=frozenset({"A"})),
        )
        self.assertEqual(broker.submit(order()).status, BrokerOrderStatus.REJECTED)
        self.assertEqual(broker.reconcile(), ())

    def test_unfilled_accepted_order_can_be_cancelled(self):
        broker = DeterministicPaperBroker(
            {"A": Decimal("100")}, PaperBrokerConfig(fill_fraction=Decimal("0"))
        )
        receipt = broker.submit(order())
        self.assertEqual(receipt.status, BrokerOrderStatus.ACCEPTED)
        self.assertEqual(broker.cancel(receipt.broker_order_id).status, BrokerOrderStatus.CANCELLED)
