#!/usr/bin/env python3
"""Fail-closed solution-wide LEAN NuGet advisory and runtime dependency audit."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from atlas.governance.lean_runtime_security import inspect_lean_candidate

ROOT = Path(__file__).resolve().parents[1]
DOTNET = ROOT / ".tooling/dotnet/dotnet"
PROJECT = ROOT / "Lean/QuantConnect.Lean.sln"
WARNING = re.compile(
    r"warning NU190[234]: Package '([^']+)' ([^ ]+) "
    r"has a known (\w+) severity vulnerability, (https://\S+)"
)
TABLE_ROW = re.compile(
    r"^\s*>\s+(\S+)\s+(\S+)\s+(Critical|High|Moderate|Low)\s+(https://\S+)",
    re.IGNORECASE,
)
TABLE_CONTINUATION = re.compile(r"^\s+(Critical|High|Moderate|Low)\s+(https://\S+)", re.I)


def parse_advisories(output: str) -> list[dict[str, str]]:
    found: set[tuple[str, str, str, str]] = set()
    for match in WARNING.finditer(output):
        found.add((match[1], match[2], match[3].lower(), match[4].rstrip("]")))
    current_name: str | None = None
    current_version: str | None = None
    for line in output.splitlines():
        row = TABLE_ROW.match(line)
        if row:
            current_name, current_version = row[1], row[2]
            found.add((current_name, current_version, row[3].lower(), row[4]))
            continue
        continuation = TABLE_CONTINUATION.match(line)
        if continuation and current_name and current_version:
            found.add((current_name, current_version, continuation[1].lower(), continuation[2]))
    return [{"package": a, "version": b, "severity": c, "url": d} for a, b, c, d in sorted(found)]


def audit_verdict(output: str, *, returncode: int, min_projects: int = 20) -> bool:
    """NuGet may return exit code zero even when vulnerability rows are present."""
    clean = len(re.findall(r"has no vulnerable packages", output))
    return (
        returncode == 0
        and clean >= min_projects
        and "has the following vulnerable packages" not in output
        and "No assets file was found" not in output
        and not parse_advisories(output)
    )


def run() -> int:
    if not DOTNET.exists() or not PROJECT.exists():
        raise RuntimeError("LEAN SDK or solution missing: cannot certify dependencies")
    result = subprocess.run(  # noqa: S603 - fixed local SDK and solution
        [
            str(DOTNET),
            "list",
            str(PROJECT),
            "package",
            "--vulnerable",
            "--include-transitive",
            "--no-restore",
        ],
        capture_output=True,
        text=True,
        timeout=80,
    )
    output = result.stdout + "\n" + result.stderr
    issues = parse_advisories(output)
    runtime = inspect_lean_candidate(ROOT / "Lean", known_advisory_count=len(issues))
    clean_projects = output.count("has no vulnerable packages")
    passed = audit_verdict(output, returncode=result.returncode) and runtime.passed
    verdict = "PASS" if passed else "BLOCKED"
    report = {
        "status": verdict,
        "returncode": result.returncode,
        "projects_without_advisories": clean_projects,
        "issues": issues,
        "runtime_blockers": runtime.blockers,
        "runtime_package_count": runtime.observed_packages,
    }
    path = ROOT / "artifacts/security/lean-dependency-audit.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(
        f"LEAN DEPENDENCY SECURITY: {verdict} ({len(issues)} advisories; "
        f"{clean_projects} clean projects; {runtime.observed_packages} runtime references)"
    )
    for issue in issues:
        print(f"  {issue['package']} {issue['version']}: {issue['severity']}")
    for blocker in runtime.blockers:
        print(f"  runtime blocker: {blocker}")
    return 0 if passed else 2


if __name__ == "__main__":
    raise SystemExit(run())
