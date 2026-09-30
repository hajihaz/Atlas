# Atlas external and owner gates

These items are intentionally not satisfiable by offline engineering alone.

- PostgreSQL integration: requires an authorized `ATLAS_TEST_DB`; unit/contract tests do not substitute for a real transaction test.
- Upstox sandbox lifecycle: requires `UPSTOX_SANDBOX_ACCESS_TOKEN`. Current Upstox documentation marks V3 place order sandbox-enabled and documents sandbox place/modify/cancel coverage. Atlas must not claim lifecycle success until the real sandbox call is executed and reconciled.
- Sustained market paper evidence: requires actual timestamped external market sessions/data; deterministic simulation is not a substitute.
- Production broker selection: owner decision after provider due diligence and validated integration evidence.
- Production secret manager: requires deployed infrastructure and least-privilege credential provisioning.
- Compliance review: requires the intended account, instruments, automation model, and jurisdiction to be reviewed.
- Final live certification: requires all production evidence above to be rerun against deployed infrastructure.
- Human authorization/live mode: must be explicit and separate from engineering certification.
- Controlled live rollout: cannot begin until every live-readiness gate is independently satisfied.
