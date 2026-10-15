"""Fail-closed LEAN candidate dependency closure and vulnerable package policy.

A clean NuGet advisory list is not enough if published launcher dependencies are absent.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

REQUIRED_RUNTIME_PACKAGES = frozenset(
    {
        "QuantConnect.pythonnet",
        "protobuf-net",
        "RestSharp",
        "Accord.Math",
        "MathNet.Numerics",
        "Microsoft.IO.RecyclableMemoryStream",
        "NodaTime",
    }
)
VULNERABLE_LEGACY_ZIP = "DotNetZip"
PATCHED_ZIP = "ProDotNetZip"


@dataclass(frozen=True)
class LeanCandidateVerdict:
    passed: bool
    blockers: tuple[str, ...]
    observed_packages: int


def runtime_package_names(deps_json: dict[str, object]) -> frozenset[str]:
    libraries = deps_json.get("libraries")
    if not isinstance(libraries, dict):
        raise ValueError("missing launcher runtime dependency manifest")
    return frozenset(
        str(label).rsplit("/", 1)[0]
        for label, item in libraries.items()
        if isinstance(item, dict) and item.get("type") in ("package", "reference")
    )


def evaluate_lean_candidate(
    dependency_manifest: dict[str, object], *, known_advisory_count: int
) -> LeanCandidateVerdict:
    try:
        packages = runtime_package_names(dependency_manifest)
    except ValueError:
        return LeanCandidateVerdict(False, ("missing_dependency_manifest",), 0)
    blockers = [
        f"missing_runtime_dependency:{name}"
        for name in sorted(REQUIRED_RUNTIME_PACKAGES - packages)
    ]
    if VULNERABLE_LEGACY_ZIP in packages:
        blockers.append("legacy_dotnetzip_present")
    if PATCHED_ZIP not in packages:
        blockers.append("patched_zip_not_present")
    if known_advisory_count != 0:
        blockers.append("known_vulnerable_packages")
    return LeanCandidateVerdict(not blockers, tuple(blockers), len(packages))


def inspect_lean_candidate(path: Path, *, known_advisory_count: int) -> LeanCandidateVerdict:
    manifest = path / "Launcher/bin/Release/QuantConnect.Lean.Launcher.deps.json"
    if not manifest.is_file():
        return LeanCandidateVerdict(False, ("missing_launcher_runtime_manifest",), 0)
    try:
        raw = json.loads(manifest.read_text())
    except (OSError, ValueError):
        return LeanCandidateVerdict(False, ("invalid_launcher_runtime_manifest",), 0)
    if not isinstance(raw, dict):
        return LeanCandidateVerdict(False, ("invalid_launcher_runtime_manifest",), 0)
    return evaluate_lean_candidate(raw, known_advisory_count=known_advisory_count)
