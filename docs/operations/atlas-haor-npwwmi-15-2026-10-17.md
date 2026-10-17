# Atlas — HAOR NPWWMI #1–#15 (17 October 2026)

## Finite objective envelope

Scope: independently executable engineering hardening, repeatable checks,
CI-only database crash/deadlock/restore drills, sandbox-only research controls,
and one verified release. Keep live capital **BLOCKED**, do not access broker
credentials, and preserve unrelated owner-maintained `.ai/` and `AGENTS.md` edits.
Do not substitute offline simulation for production market, broker, compliance,
security or disaster-recovery evidence.

Acceptance requires full local Python/type/lint/frontend checks, isolated CI
PostgreSQL tests, GitHub workflows, and read-only Vercel production verification.
All unsafe external gates must remain explicitly classified.

## Item-by-item evidence and honest limitations

| # | Approved workstream | Offline engineering delivered / existing evidence | Final acceptance limit |
|---|---|---|---|
| 1 | LEAN GIL isolation | Previous 5-run and 20-run host diagnostics reproduce Python.NET finalizer GIL crash, despite 8 successful independent LEAN trading fixtures | **UPSTREAM BLOCKED**; no false reliability claim, no dependency patch made |
| 2 | Interrupted writes and restart | Four actual child-process exits while SQLite write-lock held and row uncommitted; no phantom events afterward | **LOCAL VERIFIED**; host power failure not simulated |
| 3 | Cross-service atomicity | Persistent SQLite order/fill/account journal crash rollback plus prior ledger/idempotency transaction tests | **PARTIAL**; external broker+DB two-phase atomicity cannot be made offline |
| 4 | PostgreSQL deadlock | New symmetric two-session row-lock deadlock injects SQLSTATE 40P01 and validates unchanged test table after rollback | **CI VERIFICATION REQUIRED** in disposable PostgreSQL 17 schema |
| 5 | Physical PostgreSQL restore | Hardened prior CI pg_basebackup and pg_verifybackup: boots backup on separate localhost port 55433, checks three rows and cash sum 607.50, stops duplicate server | **CI VERIFICATION REQUIRED**; disposable test restore only |
| 6 | Point-in-time corporate actions | Duplicate/mixed-instrument actions now rejected; pre-ex-date split regression check retained | **LOCAL VERIFIED**; vendor-supplied issuer source not independently attested |
| 7 | Liquidity/spread/gap stress | New optional `AdverseMarketCostModel` (spread+gap+impact), nonnegative and finite checks; actual deterministic backtest confirms cost worsens return | **LOCAL VERIFIED synthetic**; no real venue quote/impact calibration |
| 8 | Broker late-event hardening | Terminal fill cannot be replaced with cancellation, time regression rejected, replay idempotent | **LOCAL VERIFIED**; no authenticated broker callbacks |
| 9 | Durable emergency control | Alert failure drill retains durable halt across reopen; no trading and no automatic clear | **LOCAL VERIFIED**; real independent production kill path absent |
| 10 | Secret/network authority | Forged execution role with extra privileges denied by equality policy | **LOCAL VERIFIED contract only**; not a deployed firewall |
| 11 | Signing rotation | Synthetic HMAC key rotation rejects retired key and tampered manifest | **LOCAL VERIFIED test keys only**; production key service/immutable ledger absent |
| 12 | Alert escalation | Injected fake notification accepts/rejects/throws; failed delivery requires escalation and cannot clear emergency halt | **LOCAL VERIFIED fake notifier only**; no owner paging service |
| 13 | Jarvis read-only boundary | Forged all-green display cannot call broker order/live enable commands | **LOCAL VERIFIED contract only**; Jarvis repo left untouched |
| 14 | Repeated safety soak | Twelve successive runs of 18 new safety tests each passed; existing repeat CI also expanded | **LOCAL VERIFIED short campaign**; not a multi-day hardware soak |
| 15 | CI/audit/release | Ruff, mypy, all Python tests, Vite/TypeScript and whitespace passed; scoped Git changes and CI/Vercel verification required | **PENDING exact release evidence** |

## Local verification snapshot before release

- 478 Python tests passed, 6 isolated PostgreSQL tests skipped without a local test DB.
- Ruff passes; mypy strict passes (124 source files); frontend check and Vite build pass.
- 12 independent repetitions of the three new safety test files, 18 tests each: PASS.
- Existing 8 real LEAN archived golden fixtures: unchanged.
- No live orders, credentials, authorized provider data or real capital exposure.

## External gates

The LEAN Python.NET intermittent crash is an upstream technical blocker.
Live broker credentials, production PostgreSQL, production secret management,
real-market data, independent alert delivery, compliance review and explicit
human live approval remain independent external or owner gates. This report
must not be used to mark Atlas live-trading-ready.


## CI recovery note

Initial hosted run for `f3ce903` verified **483 passed / 1 skipped**
including the genuine PostgreSQL deadlock test (server recorded SQLSTATE
40P01), but the subsequent physical restore shell failed before execution
with a nested quotation error (exit 127). The restore wrapper was repaired
to avoid embedded single quotes and gained an independently parsed
embedded-shell contract test. The failed run remains retained as evidence;
only a new successful hosted restore can close workstream #5.


## Hosted acceptance — repair release c3d7a0a

- GitHub `atlas-python-ci`: **PASS**, 484 tests passed, one unrelated
  archived LEAN sample test skipped on the disposable GitHub runner.
- PostgreSQL 17 CI: **PASS**, genuine SQLSTATE 40P01 deadlock rollback test.
- PostgreSQL 17 backup integrity: **PASS**, physical `pg_basebackup` and
  `pg_verifybackup`; the copied cluster actually started on isolated local
  port 55433, returned the original 3 rows and numeric total 607.50, and was
  stopped by the test-only cleanup trap.
- Synthetic risk-stress, repeated offline safety, Python dependency audit,
  and secret scanning: **PASS** as part of hosted workflow.
- Vercel git-sourced production `dpl_EZDndCvzgprvgwGP6dHhP5wADHo1`:
  **READY** for SHA `c3d7a0a`; public dashboard returned HTTP 200.
- Earlier failed CI `f3ce903` is retained as a meaningful detected/repaired
  quoting defect, not ignored.
- **Outcome:** 13 of 15 approved workstreams have verified deliverables
  within offline or isolated-CI scope. #1 is upstream-blocked (intermittent
  Python.NET NUnit/GIL); #3 remains partially verified because independent
  production broker/database atomicity cannot be certified offline.
  Some accepted items still have independent *production* owner/external
  gates, and none imply readiness for real-money execution.
- **Capital authorization remains BLOCKED.** No order placement occurred.
