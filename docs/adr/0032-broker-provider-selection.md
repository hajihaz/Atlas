# ADR-0032 — Broker Provider Selection Boundary

**Status:** Proposed · 2026-09-03

## Decision

Atlas will not select or activate a production broker merely because an API is technically available. Provider selection is an explicit governance decision after paper evidence, operational review, pricing/limits review, and regulatory/compliance review.

Current research indicates that DhanHQ and Upstox expose order, order-status, and trade/reconciliation APIs. DhanHQ documents static-IP requirements for order placement/modification/cancellation and publishes explicit API rate limits. Upstox documents order placement, order history, and order-trade retrieval, plus its enhanced order endpoint. These facts are provider capabilities, not an Atlas authorization.

## Boundary

- Atlas core contains contracts only; no provider SDK or HTTP transport is installed by this step.
- Credentials must never enter source, research artifacts, or the execution ledger.
- Every future live request must carry an Atlas approval and deterministic client idempotency key.
- Broker observations are reconciled back into the Atlas ledger/accounting state.
- A missing, ambiguous, or stale broker state is fail-closed.

## Current recommendation

Keep **DhanHQ and Upstox as candidates**, not a final selection. Complete a side-by-side paper/operational evaluation before choosing one. No live capital is authorized.
