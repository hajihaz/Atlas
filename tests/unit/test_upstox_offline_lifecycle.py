"""Sandbox-only lifecycle contract with an injected local fake; NO Upstox network access."""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import pytest

from atlas.broker.adapter import ApprovedOrder, OrderSide
from atlas.broker.adapter import BrokerOrderStatus as S
from atlas.broker.observation_journal import BrokerOrderObservation, DurableOrderObservationJournal
from atlas.broker.upstox_sandbox import UpstoxSandboxAdapter, UpstoxSandboxConfig

WHEN = dt.datetime(2026, 10, 16, tzinfo=dt.UTC)


class LocalSandboxTransport:
    def __init__(self):
        self.calls: list[dict[str, object]] = []

    def __call__(self, *, url, access_token, payload):
        assert "sandbox.upstox.com" in url
        assert access_token == "test-placeholder-not-real"  # never an actual API credential
        assert payload["tag"] == "idem-local-only"
        self.calls.append(dict(payload))
        return {"data": {"order_id": "SIMULATED-ORDER-1"}}


def _record(event, status, filled=0):
    return BrokerOrderObservation(
        event, "SIMULATED-ORDER-1", "idem-local-only", status, filled, 10, WHEN
    )


def test_offline_sandbox_place_partial_cancel_reconcile(tmp_path: Path):
    transport = LocalSandboxTransport()
    adapter = UpstoxSandboxAdapter(
        UpstoxSandboxConfig(
            access_token="test-placeholder-not-real",
            instrument_tokens={"SPY": "TEST|SPY"},
        ),
        transport,
    )
    approved = ApprovedOrder(
        instrument_id="SPY",
        quantity=10,
        approval_id="test-only-risk-approval",
        idempotency_key="idem-local-only",
        side=OrderSide.BUY,
    )
    receipt = adapter.submit(approved)
    assert receipt.status == S.ACCEPTED
    assert receipt.broker_order_id == "SIMULATED-ORDER-1"
    assert len(transport.calls) == 1
    journal = DurableOrderObservationJournal(tmp_path / "sandbox-orders.sqlite")
    assert journal.append(_record("e1", S.ACCEPTED))
    assert journal.append(_record("e2", S.PARTIALLY_FILLED, 4))
    assert journal.append(_record("e3", S.CANCELLED, 4))
    assert not journal.append(_record("e3", S.CANCELLED, 4))
    assert J_replay(journal) == ("accepted", "partially_filled", "cancelled")
    assert adapter.reconcile() == ()  # Never fabricate fills.
    with pytest.raises(RuntimeError):
        journal.append(_record("forged", S.FILLED, 10))


def J_replay(journal: DurableOrderObservationJournal) -> tuple[str, ...]:
    journal.verify()
    return tuple(record.status.value for record in journal.records())


def test_offline_sandbox_unapproved_missing_scope_never_invokes_transport():
    transport = LocalSandboxTransport()
    adapter = UpstoxSandboxAdapter(
        UpstoxSandboxConfig(
            access_token="test-placeholder-not-real",
            instrument_tokens={"SPY": "TEST|SPY"},
        ),
        transport,
    )
    without_approval = ApprovedOrder(
        instrument_id="SPY",
        quantity=10,
        idempotency_key="idem-local-only",
        approval_id="",
        side=OrderSide.BUY,
    )
    with pytest.raises(ValueError):
        adapter.submit(without_approval)
    assert transport.calls == []
