"""Enforce a least-privilege, provider-neutral local deployment authority plan.

This is an executable policy check, not a firewall or deployed service.
"""

from __future__ import annotations

from dataclasses import dataclass

from atlas.common.hashing import content_hash


@dataclass(frozen=True)
class ZoneAuthority:
    name: str
    egress: frozenset[str]
    secrets: frozenset[str]
    can_place_orders: bool = False
    can_halt: bool = False


EXPECTED_ZONES = (
    ZoneAuthority("data", frozenset({"market-data"}), frozenset({"market-read"})),
    ZoneAuthority("research", frozenset(), frozenset()),
    ZoneAuthority("risk", frozenset(), frozenset(), can_halt=True),
    ZoneAuthority(
        "execution",
        frozenset({"broker-write"}),
        frozenset({"broker-write"}),
        can_place_orders=True,
    ),
    ZoneAuthority(
        "reconciliation",
        frozenset({"broker-read"}),
        frozenset({"broker-read"}),
        can_halt=True,
    ),
    ZoneAuthority("monitoring", frozenset(), frozenset(), can_halt=True),
)


@dataclass(frozen=True)
class DeploymentDryRun:
    passed: bool
    reasons: tuple[str, ...]
    policy_hash: str


def validate_deployment_policy(
    zones: tuple[ZoneAuthority, ...] = EXPECTED_ZONES,
) -> DeploymentDryRun:
    expected = {zone.name: zone for zone in EXPECTED_ZONES}
    actual = {zone.name: zone for zone in zones}
    reasons = []
    if len(actual) != len(zones) or set(actual) != set(expected):
        reasons.append("zone_identity_mismatch")
    for name in sorted(set(actual) & set(expected)):
        if actual[name] != expected[name]:
            reasons.append(f"authority_mismatch:{name}")
    return DeploymentDryRun(
        not reasons,
        tuple(reasons),
        content_hash(
            [
                {
                    "name": z.name,
                    "egress": sorted(z.egress),
                    "secrets": sorted(z.secrets),
                    "can_place_orders": z.can_place_orders,
                    "can_halt": z.can_halt,
                }
                for z in sorted(zones, key=lambda item: item.name)
            ]
        ),
    )


def assert_zone_capability(zone: ZoneAuthority, *, capability: str) -> None:
    # An injected/fabricated ZoneAuthority is never an authorization token.
    # Compare the FULL policy, including secrets and egress, before accepting
    # a capability. This is still an offline policy check, not a firewall.
    canonical = next((item for item in EXPECTED_ZONES if item.name == zone.name), None)
    if canonical is None or zone != canonical:
        raise RuntimeError(f"deployment authority denied: {zone.name}/{capability}")
    if capability == "place-order" and zone.can_place_orders and zone.name == "execution":
        return
    if capability == "halt" and zone.can_halt:
        return
    if capability.startswith("egress:") and capability[7:] in zone.egress:
        return
    raise RuntimeError(f"deployment authority denied: {zone.name}/{capability}")
