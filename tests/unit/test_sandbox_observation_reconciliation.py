"""Reconciliation never grants submission authority or invents broker fills."""

from __future__ import annotations

import datetime as dt

import pytest

from atlas.broker.adapter import ApprovedOrder, BrokerOrderStatus, OrderSide
from atlas.broker.observation_journal import (
    BrokerOrderObservation,
    DurableOrderObservationJournal,
)
from atlas.broker.sandbox_submission_gate import SandboxAtMostOnceGate
from atlas.broker.upstox_sandbox import UpstoxSandboxAdapter, UpstoxSandboxConfig
from atlas.health import HealthSignal, evaluate_health
from atlas.operations_hardening import DurableEmergencyStore


def _setup(tmp_path):
    gate = SandboxAtMostOnceGate(tmp_path / "intent.db")
    halt = DurableEmergencyStore(tmp_path / "halt.json")
    halt.clear("offline initialization")
    proof = {"emergency_store": halt, "health": evaluate_health((HealthSignal("risk", True),))}
    order = ApprovedOrder(
        "SPY", 5, approval_id="unit-only-approval", idempotency_key="client-1", side=OrderSide.BUY
    )
    adapter = UpstoxSandboxAdapter(
        UpstoxSandboxConfig(
            access_token="dummy",
            instrument_tokens={"SPY": "TEST|SPY"},
        ),
        lambda **kwargs: {"data": {"order_id": "simulated-broker-1"}},
    )
    gate.submit_once(adapter, order, **proof)
    return gate, order, adapter, proof


def _event(status, *, broker="simulated-broker-1", event_id="ev-1", fill=0):
    return BrokerOrderObservation(
        event_id, broker, "client-1", status, fill, 5, dt.datetime(2026, 10, 16, tzinfo=dt.UTC)
    )


def test_read_only_reconciliation_requires_matching_broker_order_identity(tmp_path):
    gate, order, adapter, proof = _setup(tmp_path)
    journal = DurableOrderObservationJournal(tmp_path / "broker-events.db")
    with pytest.raises(RuntimeError, match="observation missing"):
        gate.verify_read_only_observations(order.idempotency_key, journal)
    journal.append(_event(BrokerOrderStatus.ACCEPTED, broker="different-broker"))
    with pytest.raises(RuntimeError, match="differs from durable"):
        gate.verify_read_only_observations(order.idempotency_key, journal)
    with pytest.raises(RuntimeError, match="reconcile by broker"):
        gate.submit_once(adapter, order, **proof)


def test_partial_fill_then_cancel_is_read_only_not_resubmittable(tmp_path):
    gate, order, adapter, proof = _setup(tmp_path)
    journal = DurableOrderObservationJournal(tmp_path / "broker-events.db")
    journal.append(_event(BrokerOrderStatus.ACCEPTED))
    journal.append(_event(BrokerOrderStatus.PARTIALLY_FILLED, event_id="ev-2", fill=3))
    journal.append(_event(BrokerOrderStatus.CANCELLED, event_id="ev-3", fill=3))
    assert (
        gate.verify_read_only_observations(order.idempotency_key, journal)
        == BrokerOrderStatus.CANCELLED
    )
    with pytest.raises(RuntimeError, match="reconcile by broker"):
        gate.submit_once(adapter, order, **proof)


def test_missing_persisted_submission_identity_is_not_reconciled(tmp_path):
    gate = SandboxAtMostOnceGate(tmp_path / "intent.db")
    journal = DurableOrderObservationJournal(tmp_path / "events.db")
    journal.append(_event(BrokerOrderStatus.ACCEPTED))
    with pytest.raises(RuntimeError, match="no confirmed"):
        gate.verify_read_only_observations("client-1", journal)
