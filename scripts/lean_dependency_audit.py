#!/usr/bin/env python3
"""Machine-readable fail-closed .NET LEAN dependency advisory inventory."""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOTNET = ROOT / ".tooling/dotnet/dotnet"
PROJECT = ROOT / "Lean/Launcher/QuantConnect.Lean.Launcher.csproj"
WARNING = re.compile(
    r"warning NU190[234]: Package '([^']+)' ([^ ]+) "
    r"has a known (\w+) severity vulnerability, (https://\S+)"
)


def parse_advisories(output: str) -> list[dict[str, str]]:
    found: set[tuple[str, str, str, str]] = set()
    for match in WARNING.finditer(output):
        found.add((match[1], match[2], match[3], match[4].rstrip("]")))
    return [
        {"package": a, "version": b, "severity": c, "url": d}
        for a, b, c, d in sorted(found)
    ]


def run() -> int:
    if not DOTNET.exists() or not PROJECT.exists():
        raise RuntimeError("LEAN SDK or project missing: cannot certify dependencies")
    command = [
        str(DOTNET), "list", str(PROJECT), "package", "--vulnerable",
        "--include-transitive",
    ]
    result = subprocess.run(  # noqa: S603 - fixed local SDK + project
        command, capture_output=True, text=True, timeout=80,
    )
    output = result.stdout + "\n" + result.stderr
    issues = parse_advisories(output)
    verdict = "BLOCKED" if issues or result.returncode else "PASS"
    report = {"status": verdict, "returncode": result.returncode, "issues": issues}
    path = ROOT / "artifacts/security/lean-dependency-audit.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(f"LEAN DEPENDENCY SECURITY: {verdict} ({len(issues)} advisories)")
    for issue in issues:
        print(f"  {issue['package']} {issue['version']}: {issue['severity']}")
    return 0 if verdict == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(run())
