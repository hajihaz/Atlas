#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
PY="${ATLAS_PYTHON:-/opt/homebrew/opt/python@3.11/bin/python3.11}"
cd "$ROOT"
export PYTHONPATH="$ROOT/src${PYTHONPATH:+:$PYTHONPATH}"
echo "[1/11] Python: $($PY --version)"
echo "[2/11] Ruff"; $PY -m ruff check src tests scripts
echo "[3/11] Mypy strict"; $PY -m mypy src/atlas
echo "[4/11] Compile"; $PY -m compileall -q src tests scripts
echo "[5/11] Unit + reproducibility"; $PY -m pytest tests/unit tests/reproducibility -q
echo "[6/11] Full pytest"; $PY -m pytest -q
echo "[7/11] Dependency audit"; $PY -m pip_audit
echo "[8/11] Secret scan"; $PY -m detect_secrets scan src scripts tests pyproject.toml --all-files > /tmp/atlas-secrets.json; $PY -c 'import json; d=json.load(open("/tmp/atlas-secrets.json")); assert not d.get("results"), d["results"]'
echo "[9/11] Offline governance certification"; $PY scripts/atlas_certify.py
echo "[10/11] LEAN golden fixture"; $PY scripts/lean_golden_certify.py
echo "[11/11] Git whitespace"; git diff --check
echo "ATLAS ENGINEERING CERTIFICATION: PASS (offline only; live capital remains separately gated)"
