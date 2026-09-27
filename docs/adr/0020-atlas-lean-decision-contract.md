# ADR 0020 — Atlas → LEAN Decision Contract

> **Status:** Proposed
> **Date:** 2026-09-03
> **Phase:** 4 integration

## Context

Atlas must use LEAN for richer simulation without allowing an external engine to
become the source of truth for strategy identity, evidence, or capital authority.
The first integration boundary therefore needs to be narrower than a general
broker/order API.

## Decision

Atlas sends LEAN an immutable `LeanDecisionEnvelope`. The envelope contains:

- versioned strategy identity and deterministic config id;
- Atlas decision date and a strictly later effective date;
- instrument target weights;
- point-in-time snapshot identity;
- evidence identity;
- explicit execution-model name;
- a deterministic content hash.

The contract contains **no broker credentials, broker order ids, order placement
methods, quantities, prices, or direct execution authority**.

The initial execution convention is `next_session_close_to_close`, matching ADR
0019. A later open/intraday model must use a new explicit convention and tests.

## Safety invariants

1. `effective_date > decision_date`.
2. Each instrument occurs at most once.
3. Target weights are finite decimals.
4. Input ordering cannot change the envelope hash.
5. LEAN consumes targets only; Atlas remains authoritative for evidence and approval.
6. The adapter must never expose future market data to strategy code.

## Consequences

This gives Atlas a small, auditable seam that can later be implemented by a LEAN
algorithm without importing LEAN into Atlas's trusted research core. It also makes
cross-engine golden testing possible: the same Atlas decision envelope can be fed
to the reference engine and to LEAN under explicitly matched assumptions.

The contract is intentionally not a live execution API. Broker integration remains
behind a separate Atlas execution boundary and is prohibited from being introduced
through this adapter.
