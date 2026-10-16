"""Sandbox journal must refuse malformed records or a dangerous storage boundary."""

from __future__ import annotations

import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from atlas.broker.adapter import ApprovedOrder, OrderSide
from atlas.broker.sandbox_submission_gate import SandboxAtMostOnceGate
from atlas.broker.upstox_sandbox import UpstoxSandboxAdapter, UpstoxSandboxConfig
from atlas.health import HealthSignal, evaluate_health
from atlas.operations_hardening import DurableEmergencyStore


def _order() -> ApprovedOrder:
    return ApprovedOrder(
        "SPY",
        2,
        approval_id="offline-unit-approval",
        idempotency_key="unit-idem-1",
        side=OrderSide.BUY,
    )


def _safe_proofs(tmp_path: Path) -> dict:
    halt = DurableEmergencyStore(tmp_path / "halt.json")
    halt.clear("initialized for a strictly offline test")
    return {
        "emergency_store": halt,
        "health": evaluate_health((HealthSignal("risk", True),)),
    }


def _transport(calls: list[object]) -> UpstoxSandboxAdapter:
    def call(**kwargs):
        calls.append(kwargs)
        return {"data": {"order_id": "simulated-id"}}

    return UpstoxSandboxAdapter(
        UpstoxSandboxConfig(
            access_token="offline-dummy",
            instrument_tokens={"SPY": "TEST|SPY"},
        ),
        call,
    )


@pytest.mark.parametrize(
    "column,value",
    [
        ("request_digest", "forged"),
        ("state", "garbage"),
        ("state", "accepted"),
        ("broker_order_id", "   "),
    ],
)
def test_invalid_persisted_record_blocks_replay(tmp_path, column, value):
    file = tmp_path / "submission.db"
    gate = SandboxAtMostOnceGate(file)
    proofs = _safe_proofs(tmp_path)
    calls = []
    assert gate.submit_once(_transport(calls), _order(), **proofs).broker_order_id
    with sqlite3.connect(file) as db:
        if column == "state" and value == "accepted":
            db.execute("UPDATE sandbox_intents SET broker_order_id=NULL")
        else:
            db.execute(f"UPDATE sandbox_intents SET {column}=?", (value,))
    with pytest.raises(RuntimeError, match="invalid sandbox submission"):
        gate.submit_once(_transport(calls), _order(), **proofs)
    assert len(calls) == 1


def test_incompatible_preexisting_sqlite_schema_is_denied(tmp_path):
    file = tmp_path / "bad-schema.db"
    with sqlite3.connect(file) as db:
        db.execute("CREATE TABLE sandbox_intents(idempotency_key TEXT, request_digest TEXT)")
    with pytest.raises(RuntimeError, match="unsafe sandbox submission journal schema"):
        SandboxAtMostOnceGate(file)


def test_symlink_to_unrelated_file_is_never_followed(tmp_path):
    destination = tmp_path / "unrelated.txt"
    destination.write_text("owner content must not be modified")
    link = tmp_path / "linked.db"
    link.symlink_to(destination)
    with pytest.raises(RuntimeError, match="symlinks are forbidden"):
        SandboxAtMostOnceGate(link)
    assert destination.read_text() == "owner content must not be modified"


def test_competing_threads_call_sandbox_only_once(tmp_path):
    file = tmp_path / "concurrent.db"
    gate = SandboxAtMostOnceGate(file)
    calls: list[object] = []
    adapter = _transport(calls)
    proofs = _safe_proofs(tmp_path)

    def worker(_index: int) -> str:
        try:
            return gate.submit_once(adapter, _order(), **proofs).status.value
        except RuntimeError as exc:
            return str(exc)

    with ThreadPoolExecutor(max_workers=6) as executor:
        statuses = list(executor.map(worker, range(6)))
    assert statuses.count("accepted") == 1
    assert len(calls) == 1
    assert gate.observed(_order().idempotency_key).state == "accepted"
    assert all("reconcile by broker" in item for item in statuses if item != "accepted")


def test_file_is_private_to_owner(tmp_path):
    path = tmp_path / "intent.db"
    SandboxAtMostOnceGate(path)
    assert path.stat().st_mode & 0o077 == 0


def test_plausibly_modified_broker_identity_requires_external_proof(tmp_path):
    # Local schema validation is not an authentication signature. An attacker
    # with database-write permissions could still modify a plausible broker ID.
    path = tmp_path / "intent.db"
    gate = SandboxAtMostOnceGate(path)
    calls = []
    proof = _safe_proofs(tmp_path)
    gate.submit_once(_transport(calls), _order(), **proof)
    with sqlite3.connect(path) as db:
        db.execute(
            "UPDATE sandbox_intents SET broker_order_id=?",
            ("plausible-but-untrusted",),
        )
    with pytest.raises(RuntimeError, match="reconcile by broker"):
        gate.submit_once(_transport(calls), _order(), **proof)
    assert len(calls) == 1  # No repeat even when durable metadata is altered.
    assert gate.observed(_order().idempotency_key).broker_order_id == "plausible-but-untrusted"
