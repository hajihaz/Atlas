"""Tamper-evident Atlas certification provenance manifests."""

from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class CertificationManifest:
    git_sha: str
    timestamp_utc: str
    tests_passed: int
    tests_skipped: int
    dependency_audit: str
    lean_fixtures: tuple[str, ...]
    artifact_hashes: dict[str, str]

    def canonical_bytes(self) -> bytes:
        return json.dumps(asdict(self), sort_keys=True, separators=(",", ":")).encode()

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.canonical_bytes()).hexdigest()

    def sign(self, key: bytes) -> str:
        if not key:
            raise ValueError("certification signing key is empty")
        return hmac.new(key, self.canonical_bytes(), hashlib.sha256).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_manifest(payload: dict[str, Any], *, key: bytes | None = None) -> bool:
    manifest = CertificationManifest(**payload["manifest"])
    if not hmac.compare_digest(manifest.sha256, str(payload.get("manifest_sha256", ""))):
        return False
    signature = payload.get("signature_hmac_sha256")
    if key is None:
        return signature is None
    return isinstance(signature, str) and hmac.compare_digest(manifest.sign(key), signature)
