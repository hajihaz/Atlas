# Atlas production deployment boundary

This is architecture only; it does not authorize live capital.

Atlas separates five trust domains: research/data, strategy/risk, paper execution, broker
transport, and governance/operations. Research and strategy processes have no broker network
credentials. Broker transport is the only process permitted to reach an external broker and
accepts only already-approved immutable orders. Risk and governance are independent fail-closed
gates. Durable portfolio/ledger/idempotency state must be on transactional storage before any
production-capital consideration. Secrets come from a runtime secret manager and never source,
logs, checkpoints, or research artifacts.

Production health requires fresh point-in-time data, healthy reconciliation, verified ledger
integrity, monitoring, tested persistent kill switch, isolated production credentials, and an
authenticated human authorization. Loss of any capital-blocking health signal disables new
capital-increasing actions. Recovery starts halted until durable state and broker observations
reconcile.
