"""Offline readiness checks. Passing never authorizes live capital."""

from dataclasses import dataclass
from pathlib import Path

from atlas.governance.audit import scan_tree


@dataclass(frozen=True)
class CertificationCheck:
    name: str
    passed: bool
    detail: str


@dataclass(frozen=True)
class CertificationReport:
    checks: tuple[CertificationCheck, ...]

    @property
    def passed(self) -> bool:
        return all(c.passed for c in self.checks)

    @property
    def status(self) -> str:
        return "PASS" if self.passed else "BLOCKED"


def certify_offline(root: Path) -> CertificationReport:
    src = root / "src" / "atlas"
    findings = scan_tree(src)
    checks = [
        CertificationCheck("authority_secret_scan", not findings, f"{len(findings)} finding(s)")
    ]
    required = [
        root / "docs/adr/0056-live-trading-entry-gate.md",
        root / "docs/research/paper-validation.md",
        root / "atlas-golden-decision.json",
    ]
    missing = [str(p.relative_to(root)) for p in required if not p.is_file()]
    checks.append(
        CertificationCheck(
            "required_artifacts",
            not missing,
            "present" if not missing else "missing: " + ",".join(missing),
        )
    )
    # The governance scanner already permits only the explicitly isolated transport.
    checks.append(
        CertificationCheck(
            "network_authority_isolation",
            not findings,
            "isolated" if not findings else "audit finding present",
        )
    )
    return CertificationReport(tuple(checks))
