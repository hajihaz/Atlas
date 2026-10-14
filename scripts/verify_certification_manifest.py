#!/usr/bin/env python3
"""Verify the committed source and captured gate logs against a manifest."""

from __future__ import annotations

import json
import os
from pathlib import Path

from atlas.certification_provenance import verify_manifest_artifacts

ROOT = Path(__file__).resolve().parents[1]


def run() -> int:
    path = ROOT / "artifacts/certification-manifest.json"
    payload = json.loads(path.read_text())
    raw_key = os.environ.get("ATLAS_CERT_SIGNING_KEY")
    key = raw_key.encode() if raw_key else None
    if not verify_manifest_artifacts(payload, ROOT, key=key):
        print("ATLAS CERTIFICATION MANIFEST: INVALID")
        return 2
    print("ATLAS CERTIFICATION MANIFEST: VERIFIED")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
