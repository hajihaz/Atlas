# ADR-0063: Production execution persistence contract

Status: Accepted

Atlas defines a provider-neutral `ExecutionPersistence` boundary before provisioning a production database. The production target is PostgreSQL, but execution logic must not depend on a vendor-specific client.

A committed broker observation must atomically preserve its unique external event ID, monotonic sequence, serialized event, account cash/holdings/equity, ledger hash chain, and account-state hash chain. Duplicate replay may return no-op only when it represents the already-applied event; any conflicting identity or chain divergence fails closed.

The first PostgreSQL migration is versioned and append-only by privilege. A real adapter must use a single SERIALIZABLE transaction and least-privilege role. This ADR does not provision a database, credentials, network path, or live-capital authority.
