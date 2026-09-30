#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
PY="${ATLAS_PYTHON:-/opt/homebrew/opt/python@3.11/bin/python3.11}"
cd "$ROOT"
export PYTHONPATH="$ROOT/src${PYTHONPATH:+:$PYTHONPATH}"
echo "[1/12] Python: $($PY --version)"
echo "[2/12] Ruff"; $PY -m ruff check src tests scripts
echo "[3/12] Mypy strict"; $PY -m mypy src/atlas
echo "[4/12] Compile"; $PY -m compileall -q src tests scripts
echo "[5/12] Unit + reproducibility"; $PY -m pytest tests/unit tests/reproducibility -q
echo "[6/12] Full pytest"; $PY -m pytest -q | tee /tmp/atlas-full-pytest.log
echo "[7/12] Dependency audit"; $PY -m pip_audit
echo "[8/12] Secret scan"; $PY -m detect_secrets scan src scripts tests pyproject.toml --all-files > /tmp/atlas-secrets.json; $PY -c 'import json; d=json.load(open("/tmp/atlas-secrets.json")); assert not d.get("results"), d["results"]'
echo "[9/12] Offline governance certification"; $PY scripts/atlas_certify.py
echo "[10/12] LEAN golden fixture"; $PY scripts/lean_golden_certify.py
echo "[11/12] Git whitespace"; git diff --check
echo "[12/12] Certification provenance"
read ATLAS_CERT_TESTS_PASSED ATLAS_CERT_TESTS_SKIPPED <<< "$($PY - <<'PYCOUNT'
import re
s=open('/tmp/atlas-full-pytest.log').read()
m=re.search(r'(\d+) passed(?:, (\d+) skipped)?', s)
if not m: raise SystemExit('unable to parse pytest certification count')
print(m.group(1), m.group(2) or '0')
PYCOUNT
)"
export ATLAS_CERT_TESTS_PASSED ATLAS_CERT_TESTS_SKIPPED
export ATLAS_CERT_DEPENDENCY_AUDIT=pass
export ATLAS_CERT_LEAN_FIXTURES="AtlasGoldenFixtureAlgorithm,AtlasGoldenMatrixAlgorithm,AtlasCashLimitFixtureAlgorithm"
$PY scripts/certification_manifest.py
echo "ATLAS ENGINEERING CERTIFICATION: PASS (offline only; live capital remains separately gated)"
