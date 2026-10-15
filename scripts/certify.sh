#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
PY="${ATLAS_PYTHON:-/opt/homebrew/opt/python@3.11/bin/python3.11}"
cd "$ROOT"
export PYTHONPATH="$ROOT/src${PYTHONPATH:+:$PYTHONPATH}"
EVIDENCE="$ROOT/artifacts/certification"
mkdir -p "$EVIDENCE"
echo "[1/15] Python: $($PY --version)"
echo "[2/15] Ruff"; $PY -m ruff check src tests scripts 2>&1 | tee "$EVIDENCE/ruff.log"
echo "[3/15] Mypy strict"; $PY -m mypy src/atlas 2>&1 | tee "$EVIDENCE/mypy.log"
echo "[4/15] Compile"; $PY -m compileall -q src tests scripts
echo "[5/15] Unit + reproducibility"; $PY -m pytest tests/unit tests/reproducibility -q 2>&1 | tee "$EVIDENCE/unit.log"
echo "[6/15] Full pytest"; $PY -m pytest -q 2>&1 | tee "$EVIDENCE/full-pytest.log"
echo "[7/15] Dependency audit"; $PY -m pip_audit 2>&1 | tee "$EVIDENCE/dependency-audit.log"
echo "[8/15] Secret scan"; $PY -m detect_secrets scan src scripts tests pyproject.toml --all-files --exclude-files '^scripts/lean-smoke/(bin|obj)/' > /tmp/atlas-secrets.json; $PY -c 'import json; d=json.load(open("/tmp/atlas-secrets.json")); assert not d.get("results"), d["results"]'
echo "[9/15] Offline governance certification"; $PY scripts/atlas_certify.py 2>&1 | tee "$EVIDENCE/governance.log"
echo "[10/15] LEAN golden fixture"; $PY scripts/lean_golden_certify.py 2>&1 | tee "$EVIDENCE/lean-golden.log"
echo "[11/15] LEAN dependency audit"; $PY scripts/lean_dependency_audit.py 2>&1 | tee "$EVIDENCE/lean-dependency-audit.log"
echo "[12/15] Independent LEAN compression smoke"; $PY scripts/lean_independent_smoke.py 2>&1 | tee "$EVIDENCE/lean-independent-smoke.log"
echo "[13/15] Historical replay evidence"; $PY scripts/historical_paper_replay.py 2>&1 | tee "$EVIDENCE/historical-replay.log"
echo "[14/15] Git whitespace"; git diff --check
echo "git diff --check: PASS" > "$EVIDENCE/git-whitespace.log"
echo "[15/15] Certification provenance"
read ATLAS_CERT_TESTS_PASSED ATLAS_CERT_TESTS_SKIPPED <<< "$($PY - <<'PYCOUNT'
import re
s=open("artifacts/certification/full-pytest.log").read()
m=re.search(r'(\d+) passed(?:, (\d+) skipped)?', s)
if not m: raise SystemExit('unable to parse pytest certification count')
print(m.group(1), m.group(2) or '0')
PYCOUNT
)"
export ATLAS_CERT_TESTS_PASSED ATLAS_CERT_TESTS_SKIPPED
grep -q "No known vulnerabilities found" "$EVIDENCE/dependency-audit.log"
export ATLAS_CERT_DEPENDENCY_AUDIT=pass
export ATLAS_CERT_LEAN_FIXTURES="$($PY - <<'PYLEANS'
import re
from pathlib import Path
s = Path("artifacts/certification/lean-golden.log").read_text()
fixtures = re.findall(r"^  PASS ([A-Za-z0-9]+Algorithm):", s, re.MULTILINE)
if not fixtures or f"PASS ({len(fixtures)} fixtures)" not in s:
    raise SystemExit("LEAN fixture evidence missing")
print(",".join(fixtures))
PYLEANS
)"
$PY scripts/certification_manifest.py
$PY scripts/verify_certification_manifest.py
echo "ATLAS ENGINEERING CERTIFICATION: PASS (offline only; live capital remains separately gated)"
