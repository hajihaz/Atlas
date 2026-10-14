from dataclasses import replace

import pytest

from atlas.deployment_policy import (
    EXPECTED_ZONES,
    assert_zone_capability,
    validate_deployment_policy,
)


def test_exact_authority_policy_passes_and_deterministic_digest() -> None:
    proof = validate_deployment_policy()
    assert proof.passed
    assert len(proof.policy_hash) == 64
    assert proof == validate_deployment_policy()


@pytest.mark.parametrize("name", ["data", "research", "risk", "reconciliation", "monitoring"])
def test_only_execution_can_place_orders(name: str) -> None:
    zone = next(z for z in EXPECTED_ZONES if z.name == name)
    with pytest.raises(RuntimeError, match="authority denied"):
        assert_zone_capability(zone, capability="place-order")


def test_authority_escalation_or_extra_egress_fails_dry_run() -> None:
    zone = EXPECTED_ZONES[1]
    changed = (
        EXPECTED_ZONES[0],
        replace(zone, egress=frozenset({"broker-write"})),
        *EXPECTED_ZONES[2:],
    )
    verdict = validate_deployment_policy(changed)
    assert not verdict.passed
    assert "authority_mismatch:research" in verdict.reasons


def test_execution_can_write_broker_but_not_read_private_market_feed() -> None:
    execution = EXPECTED_ZONES[3]
    assert_zone_capability(execution, capability="place-order")
    assert_zone_capability(execution, capability="egress:broker-write")
    with pytest.raises(RuntimeError, match="authority denied"):
        assert_zone_capability(execution, capability="egress:market-data")


def test_duplicate_zone_is_rejected() -> None:
    verdict = validate_deployment_policy((*EXPECTED_ZONES, EXPECTED_ZONES[-1]))
    assert not verdict.passed
    assert "zone_identity_mismatch" in verdict.reasons
