"""Sandbox submission fence: no automatic retries on uncertain external effects."""

import sqlite3
from dataclasses import replace

import pytest

from atlas.broker.adapter import (
    ApprovedOrder,
    OrderSide,
)
from atlas.broker.sandbox_submission_gate import SandboxAtMostOnceGate
from atlas.broker.upstox_sandbox import UpstoxSandboxAdapter, UpstoxSandboxConfig
from atlas.health import HealthSignal, evaluate_health
from atlas.operations_hardening import DurableEmergencyStore


def _proofs(tmp_path):
    emergency = DurableEmergencyStore(tmp_path / "operator-halt.json")
    emergency.clear("unit test explicitly initialized safe state")
    health = evaluate_health((HealthSignal("risk", True), HealthSignal("broker", True)))
    return {"emergency_store": emergency, "health": health}


def _approved() -> ApprovedOrder:
    return ApprovedOrder(
        "SPY",
        2,
        approval_id="unit-test-risk-only",
        idempotency_key="client-1",
        side=OrderSide.BUY,
    )


def _adapter(transport) -> UpstoxSandboxAdapter:
    return UpstoxSandboxAdapter(
        UpstoxSandboxConfig(access_token="dummy-not-secret", instrument_tokens={"SPY": "TEST|SPY"}),
        transport,
    )


def test_successful_submission_persists_fence_across_restarts(tmp_path):
    calls = []

    def success(**kwargs):
        calls.append(kwargs)
        return {"data": {"order_id": "BROKER-T1"}}

    file = tmp_path / "intents.db"
    gate = SandboxAtMostOnceGate(file)
    receipt = gate.submit_once(_adapter(success), _approved(), **_proofs(tmp_path))
    assert receipt.broker_order_id == "BROKER-T1"
    assert gate.observed("client-1").state == "accepted"
    with pytest.raises(RuntimeError, match="reconcile by broker"):
        SandboxAtMostOnceGate(file).submit_once(_adapter(success), _approved(), **_proofs(tmp_path))
    assert len(calls) == 1
    with pytest.raises(RuntimeError, match="conflicting"):
        SandboxAtMostOnceGate(file).submit_once(
            _adapter(success), replace(_approved(), quantity=3), **_proofs(tmp_path)
        )
    assert len(calls) == 1
    assert b"dummy-not-secret" not in file.read_bytes()


def test_timeout_after_broker_might_have_accepted_is_not_retried(tmp_path):
    calls = []

    def ambiguous(**kwargs):
        calls.append(kwargs)
        raise TimeoutError("lost HTTP response after submission")

    file = tmp_path / "intents.db"
    gate = SandboxAtMostOnceGate(file)
    with pytest.raises(RuntimeError, match="ambiguous sandbox"):
        gate.submit_once(_adapter(ambiguous), _approved(), **_proofs(tmp_path))
    assert gate.observed("client-1").state == "unknown"
    with pytest.raises(RuntimeError, match="reconcile by broker"):
        SandboxAtMostOnceGate(file).submit_once(
            _adapter(ambiguous), _approved(), **_proofs(tmp_path)
        )
    assert len(calls) == 1


def test_incomplete_confirmation_is_unknown_no_automatic_retry(tmp_path):
    calls = []

    def missing(**kwargs):
        calls.append(kwargs)
        return {"data": {}}

    gate = SandboxAtMostOnceGate(tmp_path / "intents.db")
    with pytest.raises(RuntimeError, match="not confirmed"):
        gate.submit_once(_adapter(missing), _approved(), **_proofs(tmp_path))
    assert gate.observed("client-1").state == "unknown"
    assert len(calls) == 1


def test_unapproved_order_never_calls_transport_or_persists_intent(tmp_path):
    calls = []

    def transport(**kwargs):
        calls.append(kwargs)
        return {"data": {"order_id": "B"}}

    gate = SandboxAtMostOnceGate(tmp_path / "intents.db")
    with pytest.raises(ValueError):
        gate.submit_once(
            _adapter(transport), replace(_approved(), approval_id=""), **_proofs(tmp_path)
        )
    assert gate.observed("client-1") is None
    assert not calls


def test_crash_after_durable_intent_before_network_does_not_resend(tmp_path):
    file = tmp_path / "intents.db"
    gate = SandboxAtMostOnceGate(file)
    order = _approved()
    from atlas.broker.sandbox_submission_gate import _digest_order

    with sqlite3.connect(file) as db:
        db.execute(
            "INSERT INTO sandbox_intents VALUES (?,?,?,NULL)",
            (order.idempotency_key, _digest_order(order), "pending"),
        )
    invoked = []

    def transport(**kwargs):
        invoked.append(kwargs)
        return {"data": {"order_id": "SHOULD-NOT-HAPPEN"}}

    with pytest.raises(RuntimeError, match="reconcile by broker"):
        SandboxAtMostOnceGate(file).submit_once(_adapter(transport), order, **_proofs(tmp_path))
    assert not invoked
    assert gate.observed(order.idempotency_key).state == "pending"


def test_missing_emergency_health_or_engaged_halt_prevents_transport(tmp_path):
    invoked = []

    def transport(**kwargs):
        invoked.append(kwargs)
        return {"data": {"order_id": "FORBIDDEN"}}

    gate = SandboxAtMostOnceGate(tmp_path / "intent.db")
    with pytest.raises(RuntimeError, match="mandatory persisted"):
        gate.submit_once(_adapter(transport), _approved())
    proof = _proofs(tmp_path)
    proof["emergency_store"].engage("reconciliation mismatch")
    with pytest.raises(RuntimeError, match="emergency halt"):
        gate.submit_once(_adapter(transport), _approved(), **proof)
    assert not invoked
    assert gate.observed(_approved().idempotency_key) is None
