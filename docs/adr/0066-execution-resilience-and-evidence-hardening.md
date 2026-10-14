# ADR-0066: Execution resilience and evidence hardening

Status: Accepted (offline), production gates remain blocked.

- PostgreSQL: serialize execution appends by locking the execution schema metadata row; verify all persisted records before accepting either a replay or a new append, and compare parsed JSONB documents rather than formatting-sensitive text. Ledger and account-state hashes, cash, holdings, event identity and sequentiality are revalidated. An isolated, local PostgreSQL 17 integration campaign verifies concurrent writers, replay, conflicting identity, and post-commit tamper fail-closed behavior; this does not certify a production database or least-privilege roles.
- Certification: store real gate outputs in ignored local artifacts, hash their bytes and important source files, and verify manifest hashes. Optional HMAC requires an operator-supplied runtime key; unsigned manifests are **tamper-evident only**, not proof of external authenticity.
- Paper evidence: bind individual session equity/checkpoint/status/error observations into an evidence hash and verify them against fresh caller-supplied strategy, snapshot digest, risk configuration and observations.
- Operational safety: strict paper-execution mode requires healthy evidence and a durable emergency store before risk or order creation. Legacy research-only simulations retain explicit non-strict mode; this is not a production/live execution authorization.
- Chaos: exercise real process termination before and after atomic state replacement, competing SQLite journal processes and repeat recovery.
- Deployment: enforce a provider-neutral, exact authority matrix as an executable **dry run**. This is not a deployed firewall, network policy or runtime permission system.
- LEAN: scrub inherited credential-bearing environment variables from the external simulator process. Record upstream vulnerable packages as a **blocking finding**; do not claim vulnerability remediation without a clean dependency audit and full fixtures.

External broker selection, credentials, compliance, sustained real paper trading, production integration and explicit human live authorization remain independent gates.
