"""Test-only keyed attestation; no release/production signing material is stored."""

import json
from dataclasses import replace

from atlas.certification_provenance import (
    CertificationManifest,
    sha256_file,
    verify_manifest_artifacts,
)


def test_test_key_signed_provenance_rejects_wrong_key_and_content_tampering(tmp_path):
    body = tmp_path / "evidence.log"
    body.write_text("synthetic quality gate PASS")
    key = b"ephemeral-test-only-signature-not-a-production-key"
    manifest = CertificationManifest(
        "test-sha",
        "2026-10-16T00:00:00+00:00",
        1,
        0,
        "test-only",
        ("synthetic",),
        {"evidence.log": sha256_file(body)},
    )
    payload = {
        "manifest": json.loads(manifest.canonical_bytes()),
        "manifest_sha256": manifest.sha256,
        "signature_hmac_sha256": manifest.sign(key),
    }
    assert verify_manifest_artifacts(payload, tmp_path, key=key)
    assert not verify_manifest_artifacts(payload, tmp_path, key=b"wrong-test-key")
    body.write_text("tampered")
    assert not verify_manifest_artifacts(payload, tmp_path, key=key)
    modified = replace(manifest, tests_passed=1000)
    payload["manifest"] = json.loads(modified.canonical_bytes())
    payload["manifest_sha256"] = modified.sha256
    assert not verify_manifest_artifacts(payload, tmp_path, key=key)
