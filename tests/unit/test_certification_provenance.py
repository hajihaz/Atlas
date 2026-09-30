from atlas.certification_provenance import CertificationManifest, verify_manifest


def _manifest() -> CertificationManifest:
    return CertificationManifest(
        "abc", "2026-09-30T00:00:00+00:00", 10, 1, "pass", ("a",), {"x": "y"}
    )


def test_manifest_hash_and_signature_are_deterministic() -> None:
    manifest = _manifest()
    payload = {
        "manifest": __import__("json").loads(manifest.canonical_bytes()),
        "manifest_sha256": manifest.sha256,
    }
    assert verify_manifest(payload)
    payload["signature_hmac_sha256"] = manifest.sign(b"secret")
    assert verify_manifest(payload, key=b"secret")
    assert not verify_manifest(payload, key=b"wrong")


def test_manifest_tamper_is_detected() -> None:
    manifest = _manifest()
    payload = {
        "manifest": __import__("json").loads(manifest.canonical_bytes()),
        "manifest_sha256": manifest.sha256,
    }
    payload["manifest"]["tests_passed"] = 999
    assert not verify_manifest(payload)
