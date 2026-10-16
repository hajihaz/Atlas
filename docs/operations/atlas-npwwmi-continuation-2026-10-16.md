# Atlas NPWWMI continuation — 16 October 2026

Status: offline engineering hardening only. **Live-capital trading BLOCKED.**

## Verified code changes in this continuation

- **Durable sandbox submission integrity:** journal database uses explicit connection lifecycle and private file mode; symlink journal targets and incompatible existing SQLite schemas are refused. Invalid stored state, invalid digest or impossible broker ID/state combinations prevent subsequent transport calls. An apparently valid broker ID can still be forged by a local database writer: this is explicitly **not** an authenticated broker receipt.
- **Broker read-only reconciliation:** a durable, accepted sandbox submission may be compared against a separately captured and integrity-checked order-observation journal; missing client ID, mismatched broker ID and failed journal verification block reconciliation. The method never resubmits an order or certifies external-source authenticity.
- **Host diagnostics:** the LEAN isolated test harness supports bounded `--attempts 1..20` with separate per-attempt logs and a failing process result if any attempt fails. Existing diagnostics reproduced the Python.NET GIL finalizer crash; this remains an upstream blocking defect, **not repaired** by instrumentation.
- **PostgreSQL write contention:** an isolated CI-only test submits the same durable execution event concurrently from 12 local workers and permits only real PostgreSQL serialization/deadlock errors. It requires exactly one committed event and a hash-verifiable replay afterward. Production DB or broker access is never requested.
- **CI repeatability:** selected broker safety tests are repeated on the isolated GitHub runner. The new concurrent PostgreSQL integration runs only when `ATLAS_EXECUTION_TEST_DB` points to the test-only GitHub service.

## Safety boundaries and open work

Test-only HMAC signature verification and offline authority checks do not provide independent production signing, isolation or market provenance. The full LEAN test host is intermittently unstable; ordinary Atlas golden fixtures are separate evidence. Real Upstox sandbox read APIs, licensed real-time feeds, sustained independent paper results, production secrets/firewall/backup drills, external compliance and explicit human authorization are required before any capital use.

A successful local certification is evidence only for offline code. A separately green GitHub CI run is required to claim the new PostgreSQL test passed with a database. Existing unrelated `.ai/`, `AGENTS.md`, and ignored LEAN checkout modifications must remain uncommitted and untouched.

## Additional CI-only PostgreSQL logical backup/restore drill

The GitHub Actions PostgreSQL 17 service receives a disposable test table
containing three amounts. Inside **that ephemeral service container only**,
`pg_dump -Fc` exports the isolated schema and `pg_restore --exit-on-error`
loads it into a separate disposable CI database. A strict equality check
verifies three restored rows and a numeric total of 607.50. The script
refuses execution outside GitHub Actions or without the fixed CI service
container identity and expected local test-database URL structure.

This tests **logical archival recovery** rather than physical disk backup,
replication, disaster-recovery point objectives, or production PostgreSQL.
It is not an authorization for a real database restore.
