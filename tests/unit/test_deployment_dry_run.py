from dataclasses import replace

from atlas.deployment_dry_run import PRODUCTION_ZONES, validate_authority_zones


def test_production_authority_dry_run_passes() -> None:
    assert validate_authority_zones() == ()


def test_extra_broker_writer_fails_dry_run() -> None:
    zones = tuple(
        replace(z, broker_write=True) if z.name == "research" else z for z in PRODUCTION_ZONES
    )
    assert "broker_write_not_exclusive_to_execution" in validate_authority_zones(zones)
