# ADR-0067: Controlled LEAN dependency security upgrade

Status: Accepted for Atlas offline certification. Production review remains separate.

## Context and provenance

The external LEAN checkout is based on Git SHA `f24fc0d3df03d6bdbe0e6fc7b8522445f1d900d2`, targeting .NET 10. Because the vendor checkout is ignored by Atlas Git, repeat the reviewed changes from the tracked `scripts/lean-patches/0001-lean-security-packages.patch` via `scripts/apply_lean_security_patch.sh`. The helper refuses unknown LEAN revisions and modifications to the four touched files and is idempotent.

The ProDotNetZip replacement carries a bundled LICENSE.txt covering MS-PL, BSD, Apache, and zlib provisions; assess distribution requirements separately.

## Changes and evidence

- Compression: DotNetZip 1.16.0 to ProDotNetZip 1.20.0, retaining the Ionic.Zip API.
- Messaging and Tests: NetMQ 4.0.1.6 to 4.0.1.13, with security floors System.Security.Cryptography.Xml 6.0.1 and System.Security.Cryptography.Pkcs 6.0.3.
- Updated ZIP regression asserts a readable archive and exact round-trip bytes, not a ZIP-implementation-dependent compressed length.
- .NET 10 Release launcher and test assembly successfully built.
- Atlas golden fixture matrix: 3/3 pass with frozen equity/order/fee/turnover results unchanged.
- Patched solution-wide NuGet audit: 23 projects without reported known advisories and launcher dependency closure validated. The 13-gate offline cert runs this audit independently.
- A targeted ZIP round-trip test passes. A broad combined compression test run aborted on the previously known Python.NET GIL finalization crash; four NetMQ TCP messaging tests are skipped because their network setup is absent. A completely green LEAN test suite has NOT been demonstrated.

## Controls

Fail closed on missing or outdated package audit results, divergence in the actual LEAN fixtures, incomplete runtime manifests, or unreviewed source revisions. Certification produces hashes for the patch and the audit outputs. Engineering certification does not imply production infrastructure, security approval, broker connectivity, compliance or live-capital authorization.
