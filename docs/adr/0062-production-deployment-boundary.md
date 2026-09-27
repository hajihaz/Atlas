# ADR-0062 — Production deployment boundary

**Status:** Accepted  
**Date:** 2026-09-27

Atlas adopts a least-privilege multi-process production design. Research/AI, strategy, risk,
execution, reconciliation, and monitoring are separate authority zones. Execution is the only
broker-write boundary. Reconciliation and emergency controls can veto/halt but cannot submit
orders. Production durable state will preserve the transactional and hash-chain invariants of
the local paper journal on managed PostgreSQL. Runtime secrets are external to source and
persistent business state.

This ADR specifies architecture only. It does not select a production broker, provision
credentials, satisfy compliance, or authorize live capital.
