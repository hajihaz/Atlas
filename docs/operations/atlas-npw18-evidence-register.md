# Atlas NPW #1–#18 — current evidence register

This is a tracked supplement, not a replacement for the owner's dirty
`.ai/` files or `AGENTS.md`. Status below refers to **verified subwork**, not
an overall Atlas production-readiness percentage. No real capital is enabled.

| NPW | Current position | Evidence and remaining gate |
|---|---|---|
| 1 LEAN full-suite GIL reliability | BLOCKED | Full NUnit/Python.NET finalization still intermittently crashes; isolated .NET compression smoke and separate engine fixtures do not constitute full-suite success |
| 2 LEAN advanced orders | ADVANCED | Five actual engine fixtures: ordinary decision, multi-asset, cash-limit reject, limit cancellation, and three-step partial fill; wider order types still need separate fixtures |
| 3 Historical analysis | ADVANCED | Three disjoint 125-session archived cohorts plus separate 30-session certification; corporate-action/live feed attestation and broader performance methodology remain |
| 4 Paper integrity | PARTIAL | Strategy/data/ledger/observation hashes and signed-source receipt verification exist; an independently operated real-market issuer does not |
| 5 Crash chaos | PARTIAL | Real child process termination around journal and v2 snapshots, tampering, SQL abort and concurrent writer tests; actual power-loss and production disaster recovery not certified |
| 6 Atomic execution persistence | PARTIAL | SQLite hash-chained observed order states, validated fill replay, paper session staged commit and v2 snapshot recovery; cross-service order/ledger production atomicity still pending |
| 7 PostgreSQL integrations | VERIFIED FOR CI | GitHub-hosted Postgres 17 previously ran both integration tests successfully; new adversarial restore/migration tests must also pass after next push; local HHC policy blocks disposable local PG provisioning |
| 8 PostgreSQL resilience | PARTIAL | Real PostgreSQL concurrency/migration and logical restore tests; physical backup, production replication and permissions tests still pending |
| 9 Adverse-market risk | ADVANCED | Risk vetoes nonfinite values, turnover limit and peak drawdown during paper execution (including restarted runtime); real-market gap/slippage assumptions remain unverified |
| 10 Broker reconciliation | ADVANCED | Unknown/conflicting observations, position/cash mismatch and duplicate fills are rejected; production broker callbacks remain unverified |
| 11 Mandatory emergency safety | PARTIAL | Durable halt plus health checks and forged-health rejection; independently enforced production capital-write path not deployed |
| 12 Process/service isolation | PARTIAL | Exact software authority matrix, deny-by-default boundary and dry-run tests; real production OS/network policies not provisioned |
| 13 Upstox sandbox lifecycle | OFFLINE ONLY | Mock transport and local partial-fill/cancel observation lifecycle tests pass; authenticated Upstox API lifecycle requires sandbox token |
| 14 Signed release provenance | PARTIAL | SHA-256 hashes for source/evidence, verified manifest and optional HMAC; trusted signing key and immutable external artifact store needed |
| 15 Monitoring/incident drills | PARTIAL | Persistent emergency incident drill and recovery tests pass; actual delivery, on-call transport and deployment monitoring pending |
| 16 Jarvis access boundary | PARTIAL | Status-only Atlas contract refuses orders and live mode; actual Jarvis app integration intentionally untouched because its repo contains unrelated owner edits |
| 17 CI/performance | ADVANCED | GitHub Python 3.11 lint/mypy/dependency/secret and real PostgreSQL tests previously green; new workload and version-specific checks awaiting hosted CI result |
| 18 Tracker reconciliation | PARTIAL | This source-controlled evidence register records verified progress; owner-maintained dirty `.ai/` state intentionally preserved |

## Independent external gates

Uninterrupted real-market paper evidence, broker credentials and sandbox tests,
licensed market data, actual production PostgreSQL/secret-manager isolation,
compliance review, independent security acceptance, and explicit human
authorization all remain outside autonomous offline certification.

The contract continues to be: strategy proposes → evidence proves → independent
Risk approves/reduces/vetoes → Execution alone can write to an authorized
broker → reconciliation verifies; failed checks halt and block capital.
