# Atlas NPWWMI #1–#20 — Autonomous Safety Wave

## Scope and invariant

This checkpoint records independently tested engineering changes only. It does **not** certify real-market paper trading, production infrastructure, full upstream LEAN reliability, or live-capital eligibility. **Live broker authorization remains BLOCKED.**

No credentials were created, no authenticated Upstox operations were executed, and no order was submitted to a live broker. The existing owner-owned `.ai/` data, `AGENTS.md`, and patched external LEAN checkout are not staged.

## New verified engineering changes

- **#3, #4, #13 — At-most-once sandbox submissions:** a private SQLite intent is committed before the injected sandbox transport can run. A duplicate idempotency key, conflicting payload, ambiguous timeout, or missing broker acknowledgment blocks automatic resend even after a gate restart. Sandbox submission requires persisted emergency-state and independently supplied health evidence. Only sandbox contract fakes were called in tests; no genuine sandbox session was authenticated.
- **#10, #12 — Idempotency and permission hardening:** a client order idempotency key cannot silently map to two different broker IDs in the order-observation journal. Executable deployment-zone checks reject forged authorities whose name matches an authorized role but whose secrets, network egress, or privileges differ. This is an offline policy boundary, not a deployed OS sandbox/firewall.
- **#8, #15 — Historical evidence:** asymmetric missing bars between instruments are rejected instead of silently removing a trading date by intersecting datasets. Shared missing dates remain permitted because both instruments agree. Deterministic archived input is still not independently authenticated live market data, nor evidence of complete corporate-action adjustment.
- **#9 — Exposure and adverse-market checks:** discovered and fixed Decimal rounding that permitted a tiny gross-exposure overshoot. The independent risk gate now allocates scaled weights against a monotonically decreasing cap. Seven deterministic synthetic stress scenarios prove drawdown/stale-data/kill-switch/turnover/nonfinite vetoes and concentration/gross risk reductions without exceeding limits.
- **#14 — Signature tampering:** test-key only HMAC manifest validation rejects incorrect keys, altered artifacts and forged manifest counts. An actual owner-held release signing key and immutable evidence store are still separate requirements.
- **#17, #19 — CI repeatability:** GitHub CI adds three iterations of selected safety, crash-recovery, idempotency, historical-gap and Decimal risk checks, plus the independent synthetic risk-stress gate. It never deploys or enables capital.
- **#20 — Audit and evidence:** the 17-gate local offline certification adds risk-stress evidence to the hash-bound manifest. File, code, test and Git results must pass before commit. Unrelated user files remain untouched.

## NPWWMI status (scoped, evidence-based)

| # | Workstream | Position |
|---|---|---|
| 1 | Full LEAN NUnit/GIL reliability | **BLOCKED:** one GIL finalization crash in five repeated isolated diagnostics (four passed); no upstream runtime fix certified |
| 2 | More LEAN advanced order fixtures | **PARTIAL:** earlier five actual engine fixtures pass; further stop/replace/partial-cancel coverage not yet added |
| 3 | Ambiguous broker responses and restart recovery | **ADVANCED:** at-most-once sandbox fence rejects ambiguous/duplicate retries; real broker status retrieval still needed |
| 4 | Cross-boundary atomic order/fill/ledger commits | **PARTIAL:** durable offline journaling and paper session staging; no production distributed transaction certification |
| 5 | Crash/power-failure and concurrency | **PARTIAL:** prior process-death, SQLite conflict and multithread/multiprocess tests pass; true power cut not simulated |
| 6 | PostgreSQL stress/deadlock | **PARTIAL:** CI-backed transactional tests; production throughput and deadlock injection still needed |
| 7 | Database backup/physical restore | **PENDING:** logical schema recovery tested earlier; physical service backup/restore requires isolated infrastructure |
| 8 | Historical corporate actions/missing bars | **PARTIAL:** asymmetric missing bars now rejected; point-in-time split/dividend adjustments not certified |
| 9 | Liquidity/gaps/slippage/fees/drawdowns | **ADVANCED:** seven synthetic risk-stress scenarios and corrected Decimal gross cap; real liquidity/fee models still pending |
| 10 | Duplicate/late broker observations | **ADVANCED:** conflicting client-key mappings rejected; authenticated broker callback coverage pending |
| 11 | Mandatory halt and health checks | **ADVANCED:** sandbox at-most-once fence requires persisted emergency file and healthy observations; production write boundary remains disabled |
| 12 | Production network/secret isolation | **PARTIAL:** forged authorities denied by executable policy; actual firewall, OS identity and secret stores undeployed |
| 13 | Upstox mock adverse lifecycle | **ADVANCED:** bad responses, timeouts, restart and duplicate prevention covered offline; real sandbox token required |
| 14 | Release manifest signatures | **PARTIAL:** local test-key verification passes; no trusted production key, timestamp service or immutable registry |
| 15 | Source evidence chain | **ADVANCED:** historical asymmetric bar omission rejected, prior strategy/data hashes and ledger evidence intact; real external issuer absent |
| 16 | Monitoring incident recovery | **PARTIAL:** prior offline emergency and recovery drills; no externally delivered alerts/on-call telemetry |
| 17 | Jarvis read-only boundary | **PARTIAL:** Atlas status contract remains read-only; unrelated dirty Jarvis repo not modified |
| 18 | CI compatibility | **ADVANCED:** Python/PostgreSQL CI previously green; new repeatability step awaits a fresh hosted successful run |
| 19 | Load/repeatability | **ADVANCED:** selected safety suite repeated in CI; full long-duration production load/soak still pending |
| 20 | Repository audit | **ADVANCED:** source, tests, manifest, Git staging and clean CI results to be verified against the final pushed SHA |

This checkpoint lists verifiable implementation scope and pending gates rather than declaring all twenty works finished.
