#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
from pathlib import Path

from atlas.certification_provenance import CertificationManifest, sha256_file

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = (
    ROOT / "pyproject.toml",
    ROOT / "scripts/certify.sh",
    ROOT / "scripts/lean_golden_certify.py",
    *sorted((ROOT / "scripts/lean-fixtures").glob("*.cs")),
    ROOT / "scripts/lean_dependency_audit.py",
    ROOT / "scripts/lean_test_isolation.py",
    ROOT / "scripts/historical_paper_replay.py",
    ROOT / "scripts/historical_cohort_certify.py",
    ROOT / "src/atlas/paper/historical_cohorts.py",
    ROOT / "src/atlas/broker/observation_journal.py",
    ROOT / "artifacts/historical-cohorts.json",
    ROOT / "src/atlas/paper/historical_replay.py",
    ROOT / "artifacts/historical-paper-replay.json",
    ROOT / "scripts/lean_independent_smoke.py",
    ROOT / "scripts/lean-smoke/LeanCompressionSmoke.csproj",
    ROOT / "scripts/lean-smoke/Program.cs",
    ROOT / "scripts/apply_lean_security_patch.sh",
    ROOT / "scripts/lean-patches/0001-lean-security-packages.patch",
    ROOT / "artifacts/security/lean-dependency-audit.json",
    ROOT / "scripts/verify_certification_manifest.py",
    ROOT / "src/atlas/execution/postgres_persistence.py",
    ROOT / "src/atlas/execution/record_validation.py",
    ROOT / "src/atlas/execution/journal.py",
    ROOT / "src/atlas/broker/upstox_reconcile.py",
    ROOT / "src/atlas/risk/gate.py",
    ROOT / "src/atlas/reporting/reconcile.py",
    ROOT / "src/atlas/research/promotion.py",
    ROOT / "src/atlas/research/paper_source_attestation.py",
    ROOT / "src/atlas/governance/jarvis_boundary.py",
    ROOT / "src/atlas/monitoring_drills.py",
    ROOT / ".github/workflows/ci.yml",
    ROOT / "src/atlas/paper/evidence.py",
    ROOT / "src/atlas/paper/persistence.py",
    ROOT / "src/atlas/paper/runtime.py",
    ROOT / "src/atlas/portfolio/account.py",
    ROOT / "src/atlas/health.py",
    ROOT / "src/atlas/broker/sandbox_submission_gate.py",
    ROOT / "src/atlas/deployment_policy.py",
    ROOT / "docs/operations/atlas-npwwmi-20-autonomous-wave.md",
    ROOT / "docs/operations/atlas-npwwmi-continuation-2026-10-16.md",
    ROOT / "src/atlas/risk/stress_certification.py",
    ROOT / "src/atlas/risk/gate.py",
    ROOT / "scripts/risk_stress_certify.py",
    ROOT / "docs/adr/0069-paper-snapshot-recovery.md",
    ROOT / "docs/operations/atlas-npw18-evidence-register.md",
    *sorted((ROOT / "artifacts/certification").glob("*.log")),
)
sha = subprocess.check_output(
    ["git", "rev-parse", "HEAD"],  # noqa: S607 - fixed git argv, no shell
    cwd=ROOT,
    text=True,
).strip()
logs = ROOT / "artifacts/certification"
if "No known vulnerabilities found" not in (logs / "dependency-audit.log").read_text():
    raise RuntimeError("dependency audit evidence missing")
if "ATLAS OFFLINE CERTIFICATION: PASS" not in (logs / "governance.log").read_text():
    raise RuntimeError("governance evidence missing")
if "LEAN DEPENDENCY SECURITY: PASS" not in (logs / "lean-dependency-audit.log").read_text():
    raise RuntimeError("LEAN dependency security evidence missing")
if "LEAN INDEPENDENT COMPRESSION: PASS" not in (logs / "lean-independent-smoke.log").read_text():
    raise RuntimeError("independent LEAN compression evidence missing")
if "HISTORICAL REPLAY PASS" not in (logs / "historical-replay.log").read_text():
    raise RuntimeError("historical replay evidence missing")
if "HISTORICAL COHORT CERTIFICATION: PASS" not in (logs / "historical-cohorts.log").read_text():
    raise RuntimeError("historical cohort evidence missing")
if "ATLAS RISK STRESS: PASS" not in (logs / "risk-stress.log").read_text():
    raise RuntimeError("risk stress evidence missing")
manifest = CertificationManifest(
    git_sha=sha,
    timestamp_utc=dt.datetime.now(dt.UTC).isoformat(),
    tests_passed=int(os.environ["ATLAS_CERT_TESTS_PASSED"]),
    tests_skipped=int(os.environ.get("ATLAS_CERT_TESTS_SKIPPED", "0")),
    dependency_audit=os.environ.get("ATLAS_CERT_DEPENDENCY_AUDIT", "pass"),
    lean_fixtures=tuple(os.environ.get("ATLAS_CERT_LEAN_FIXTURES", "").split(",")),
    artifact_hashes={str(p.relative_to(ROOT)): sha256_file(p) for p in ARTIFACTS},
)
payload = {"manifest": json.loads(manifest.canonical_bytes()), "manifest_sha256": manifest.sha256}
key = os.environ.get("ATLAS_CERT_SIGNING_KEY")
if key:
    payload["signature_hmac_sha256"] = manifest.sign(key.encode())
out = ROOT / "artifacts" / "certification-manifest.json"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
print(f"CERTIFICATION MANIFEST: {out} sha256={manifest.sha256}")
