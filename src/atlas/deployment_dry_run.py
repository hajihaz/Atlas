"""Local proof of production authority-zone separation; no external infrastructure."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AuthorityZone:
    name: str
    broker_read: bool = False
    broker_write: bool = False
    market_read: bool = False
    can_halt: bool = False


PRODUCTION_ZONES = (
    AuthorityZone("data", market_read=True),
    AuthorityZone("research"),
    AuthorityZone("risk", can_halt=True),
    AuthorityZone("execution", broker_write=True),
    AuthorityZone("reconciliation", broker_read=True, can_halt=True),
    AuthorityZone("monitoring", can_halt=True),
)


def validate_authority_zones(
    zones: tuple[AuthorityZone, ...] = PRODUCTION_ZONES,
) -> tuple[str, ...]:
    failures: list[str] = []
    writers = [z.name for z in zones if z.broker_write]
    if writers != ["execution"]:
        failures.append("broker_write_not_exclusive_to_execution")
    by_name = {z.name: z for z in zones}
    required = {"data", "research", "risk", "execution", "reconciliation", "monitoring"}
    if set(by_name) != required:
        failures.append("authority_zone_set_mismatch")
    if by_name.get("research") and (
        by_name["research"].broker_read or by_name["research"].broker_write
    ):
        failures.append("research_has_broker_authority")
    if by_name.get("risk") and by_name["risk"].broker_write:
        failures.append("risk_has_broker_write")
    if by_name.get("reconciliation") and by_name["reconciliation"].broker_write:
        failures.append("reconciliation_has_broker_write")
    if by_name.get("monitoring") and by_name["monitoring"].broker_write:
        failures.append("monitoring_has_broker_write")
    return tuple(failures)
