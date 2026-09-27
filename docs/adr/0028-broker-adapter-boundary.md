# ADR 0028 — Broker Adapter Boundary

**Status:** Proposed · 2026-09-03

Broker connectivity is isolated behind an adapter contract. The adapter accepts only an already-approved order and returns broker observations/fills for reconciliation.

There is no broker implementation, credential, endpoint, or live-order capability in this phase. Adding one requires a separate provider selection, security review, paper evidence, and explicit live authorization.

The adapter must be the sole component permitted to communicate with a broker.
