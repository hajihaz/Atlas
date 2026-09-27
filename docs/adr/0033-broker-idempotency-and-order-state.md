# ADR-0033 — Broker Idempotency and Order State

**Status:** Proposed · 2026-09-03

Every future live order must have a stable Atlas client-order/idempotency key derived from immutable decision provenance. Replays must resolve to the existing client order rather than create another capital-affecting order.

Broker state is observed, never assumed: submitted → accepted/rejected → partially filled/filled/cancelled/unknown. Unknown state blocks further capital-increasing action until reconciliation resolves it.

No retry policy may blindly resubmit an ambiguous order.
