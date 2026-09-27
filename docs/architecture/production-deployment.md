# Atlas production deployment architecture

**Status:** design only — no live-capital authorization  
**Updated:** 2026-09-27

## Security zones

Atlas production is split into independently permissioned processes. Research and AI never
receive broker credentials. Market-data ingestion has read-only vendor credentials. The risk
service consumes immutable strategy decisions and account state but cannot submit orders. Only
the execution service may hold a broker session, and that service accepts only already-approved,
idempotent order envelopes. Reconciliation independently observes broker/account state and may
halt execution but cannot create orders.

## Durable state

Production persistence must use managed PostgreSQL with encrypted storage, point-in-time
recovery, least-privilege roles, and an append-only audit/export path. The local SQLite
`TransactionalExecutionJournal` is the deterministic paper/recovery reference, not the final
multi-host production database. A production implementation must preserve its invariants:
unique external event IDs, monotonic ledger sequence, ledger hash chain, account-state hash
chain, and one transaction for observation + accounting + idempotency.

## Process boundaries

1. **Data** — vendor reads only; emits point-in-time snapshots with lineage.
2. **Research/strategy** — consumes approved snapshots; emits target decisions only.
3. **Risk** — independent veto/reduction; cannot increase proposed exposure.
4. **Execution** — sole broker write boundary; requires governance, risk and human approval.
5. **Reconciliation** — broker/account reads; mismatch triggers capital-blocking health state.
6. **Monitoring/emergency** — independent kill switch and operational-health aggregation.
7. **Jarvis control plane** — orchestration/status/approval UX; never bypasses Atlas gates.

## Secrets

Production broker/data/database credentials must come from a runtime secret manager and must
not be written to source, logs, state files, decision envelopes, ledger metadata, test fixtures,
or Jarvis. Sandbox and production credentials are separate identities. Rotation/revocation must
be possible without a code deploy.

## Network policy

Default deny. Research, strategy and risk processes have no broker egress. Execution may egress
only to the selected broker API. Reconciliation may read only the required broker/account
endpoints. Database access is role-specific. Administrative access is authenticated, audited,
and not exposed as a public trading endpoint.

## Release gates

A deployable image may be built while live mode remains disabled. Promotion to a production
runtime requires immutable artifact identity, migrations, backup/restore test, observability,
secret injection, broker allow-listing, and rollback. Enabling live capital is a separate action
and still requires every `LiveReadiness` prerequisite, including authenticated human
authorization and explicit governance live mode.

## Fail-safe behavior

Unknown order state, stale market data, reconciliation mismatch, unhealthy monitoring,
credential ambiguity, journal/database divergence, or emergency halt blocks new
capital-increasing actions. Recovery never guesses broker state or fabricates fills.
