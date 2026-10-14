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


def test_manifest_rejects_mutated_and_escaped_artifact_paths(tmp_path) -> None:
    import json

    from atlas.certification_provenance import sha256_file, verify_manifest_artifacts

    target = tmp_path / "gate.log"
    target.write_text("PASS")
    original = _manifest()
    from dataclasses import replace

    manifest = replace(original, artifact_hashes={"gate.log": sha256_file(target)})
    payload = {
        "manifest": json.loads(manifest.canonical_bytes()),
        "manifest_sha256": manifest.sha256,
    }
    assert verify_manifest_artifacts(payload, tmp_path)
    target.write_text("FAIL")
    assert not verify_manifest_artifacts(payload, tmp_path)
    escaped = replace(original, artifact_hashes={"../outside": "x"})
    payload = {
        "manifest": json.loads(escaped.canonical_bytes()),
        "manifest_sha256": escaped.sha256,
    }
    assert not verify_manifest_artifacts(payload, tmp_path)
