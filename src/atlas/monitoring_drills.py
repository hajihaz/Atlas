"""Non-trading fail-closed operational drills for crash/restart and emergency state."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from atlas.common.hashing import content_hash
from atlas.health import HealthSignal, assert_operational_clear, evaluate_health
from atlas.operations_hardening import DurableEmergencyStore


@dataclass(frozen=True)
class FailClosedDrillEvidence:
    live_orders_submitted: int
    blocking_health_verified: bool
    emergency_persisted_across_reopen: bool
    still_halted_at_finish: bool
    evidence_hash: str


def simulate_fail_closed_incident(path: Path) -> FailClosedDrillEvidence:
    """Run only on a fresh local file; never clear any pre-existing emergency state."""
    if path.exists():
        raise RuntimeError("drill target already exists; cannot overwrite an emergency state")
    store = DurableEmergencyStore(path)
    health = evaluate_health(
        (
            HealthSignal("reconciliation", False, "cash diverged"),
            HealthSignal("market_data", False, "stale observation"),
        )
    )
    health_blocked = False
    try:
        assert_operational_clear(store, health, require_proofs=True)
    except RuntimeError as exc:
        health_blocked = "capital-increasing action blocked" in str(exc)
    if not health_blocked:
        raise RuntimeError("fail-closed health rejection did not occur")
    store.engage("simulated reconciliation mismatch; offline test only")
    # Reopen from disk to prove the halt is not process-local.
    reopened = DurableEmergencyStore(path)
    persisted = reopened.load().engaged
    emergency_blocked = False
    try:
        assert_operational_clear(
            reopened,
            evaluate_health((HealthSignal("market_data", True),)),
            require_proofs=True,
        )
    except RuntimeError as exc:
        emergency_blocked = "persistent emergency" in str(exc)
    if not persisted or not emergency_blocked:
        raise RuntimeError("restart failed to preserve emergency fail-closed state")
    facts = {
        "orders": 0,
        "health_blocked": health_blocked,
        "emergency_persisted": persisted,
        "still_halted": reopened.load().engaged,
    }
    return FailClosedDrillEvidence(
        0,
        health_blocked,
        persisted,
        reopened.load().engaged,
        content_hash(facts),
    )


@dataclass(frozen=True)
class AlertEscalationEvidence:
    """Injected fake-notifier results; never a real message-delivery claim."""

    delivery_attempted: bool
    delivery_acknowledged: bool
    escalation_required: bool
    emergency_still_engaged: bool
    live_orders_submitted: int


def simulate_alert_escalation(
    path: Path, deliver: Callable[[str], bool]
) -> AlertEscalationEvidence:
    """Use a fresh disposable halt state; failed alert cannot unhalt execution."""
    if path.exists() or path.is_symlink():
        raise RuntimeError("refuse to overwrite existing emergency state")
    store = DurableEmergencyStore(path)
    store.engage("offline simulated critical incident")
    accepted = False
    try:
        accepted = deliver("ATLAS_OFFLINE_CRITICAL_INCIDENT") is True
    except Exception:
        # Suppressed notification exceptions never clear the durable halt.
        accepted = False
    reopened = DurableEmergencyStore(path)
    if not reopened.load().engaged:
        raise RuntimeError("simulated alert path cleared emergency state")
    return AlertEscalationEvidence(True, accepted, not accepted, True, 0)
