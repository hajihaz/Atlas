from dataclasses import replace
from datetime import UTC, datetime

import pytest

from atlas.broker.adapter import BrokerOrderStatus
from atlas.broker.observation_journal import (
    BrokerOrderObservation,
    DurableOrderObservationJournal,
)
from atlas.deployment_policy import EXPECTED_ZONES, assert_zone_capability


def test_forged_execution_capabilities_never_authorize_broker_egress():
    canonical = EXPECTED_ZONES[3]
    assert_zone_capability(canonical, capability="place-order")
    for forged in (
        replace(canonical, egress=frozenset({"broker-write", "market-data"})),
        replace(canonical, secrets=frozenset({"broker-write", "broker-read"})),
        replace(canonical, can_halt=True),
        replace(EXPECTED_ZONES[1], egress=frozenset({"broker-write"})),
    ):
        with pytest.raises(RuntimeError, match="authority denied"):
            assert_zone_capability(forged, capability="egress:broker-write")


def test_client_idempotency_key_cannot_map_to_two_broker_orders(tmp_path):
    journal = DurableOrderObservationJournal(tmp_path / "broker.db")
    at = datetime(2026, 10, 16, tzinfo=UTC)
    accepted = BrokerOrderObservation(
        "e1", "broker-original", "client-same", BrokerOrderStatus.ACCEPTED, 0, 10, at
    )
    assert journal.append(accepted)
    impersonation = replace(accepted, event_id="e2", broker_order_id="broker-forged")
    with pytest.raises(RuntimeError, match="conflicting broker ID"):
        journal.append(impersonation)
    assert journal.records() == (accepted,)
