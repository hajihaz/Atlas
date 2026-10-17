"""Non-trading notification, release-key rollover and Jarvis role boundaries."""

import json
from dataclasses import replace

import pytest

from atlas.certification_provenance import (
    CertificationManifest,
    sha256_file,
    verify_manifest_artifacts,
)
from atlas.governance.jarvis_boundary import JarvisReadOnlyBoundary
from atlas.governance.live_gate import LiveReadiness
from atlas.monitoring_drills import simulate_alert_escalation
from atlas.operations_hardening import DurableEmergencyStore


@pytest.mark.parametrize("mode", ["delivered", "failed", "exception"])
def test_fake_delivery_and_escalation_always_preserve_halt(tmp_path, mode: str) -> None:
    path = tmp_path / "offline-halt.json"
    received = []

    def fake_send(message: str) -> bool:
        received.append(message)
        if mode == "exception":
            raise TimeoutError("offline simulated alert network down")
        return mode == "delivered"

    evidence = simulate_alert_escalation(path, fake_send)
    assert received == ["ATLAS_OFFLINE_CRITICAL_INCIDENT"]
    assert evidence.delivery_acknowledged == (mode == "delivered")
    assert evidence.escalation_required == (mode != "delivered")
    assert evidence.emergency_still_engaged and evidence.live_orders_submitted == 0
    assert DurableEmergencyStore(path).load().engaged
    with pytest.raises(RuntimeError, match="overwrite"):
        simulate_alert_escalation(path, fake_send)


def test_offline_release_key_rotation_does_not_accept_retired_or_forged_signatures(tmp_path):
    sample = tmp_path / "sample.log"
    sample.write_text("offline safety PASS")
    manifest = CertificationManifest(
        "offline-fixture-sha",
        "2026-10-17T00:00:00+00:00",
        1,
        0,
        "offline",
        ("synthetic",),
        {"sample.log": sha256_file(sample)},
    )
    previous = b"test-only-key-rotation-old"
    replacement = b"test-only-key-rotation-new"
    payload = {
        "manifest": json.loads(manifest.canonical_bytes()),
        "manifest_sha256": manifest.sha256,
        "signature_hmac_sha256": manifest.sign(previous),
    }
    assert verify_manifest_artifacts(payload, tmp_path, key=previous)
    assert not verify_manifest_artifacts(payload, tmp_path, key=replacement)
    payload["signature_hmac_sha256"] = manifest.sign(replacement)
    assert verify_manifest_artifacts(payload, tmp_path, key=replacement)
    assert not verify_manifest_artifacts(payload, tmp_path, key=previous)
    payload["manifest"]["tests_passed"] = 999999
    assert not verify_manifest_artifacts(payload, tmp_path, key=replacement)
    assert not verify_manifest_artifacts(
        {**payload, "manifest": json.loads(replace(manifest, tests_passed=3).canonical_bytes())},
        tmp_path,
        key=replacement,
    )


def test_jarvis_never_gains_order_authority_even_on_forged_all_green_status() -> None:
    from dataclasses import fields

    fully_green = LiveReadiness(**{f.name: True for f in fields(LiveReadiness)})
    boundary = JarvisReadOnlyBoundary(fully_green)
    assert not boundary.snapshot().live_capital_blocked  # display only; no authority
    with pytest.raises(PermissionError, match="read-only"):
        boundary.request_order({"quantity": 100, "broker_write_token": "fake"})
    with pytest.raises(PermissionError, match="cannot authorize"):
        boundary.enable_live_mode()


def test_forged_execution_zone_refused_even_if_role_name_matches() -> None:
    from atlas.deployment_policy import (
        EXPECTED_ZONES,
        assert_zone_capability,
        validate_deployment_policy,
    )

    execution = next(x for x in EXPECTED_ZONES if x.name == "execution")
    altered = replace(execution, secrets=frozenset({"broker-write", "admin-secret"}))
    assert not validate_deployment_policy(
        tuple(altered if x.name == "execution" else x for x in EXPECTED_ZONES)
    ).passed
    with pytest.raises(RuntimeError, match="denied"):
        assert_zone_capability(altered, capability="place-order")
