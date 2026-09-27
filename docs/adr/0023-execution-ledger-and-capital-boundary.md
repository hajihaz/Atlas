# ADR 0023 — Execution Ledger and Capital Boundary

**Status:** Proposed · 2026-09-03

## Decision

Atlas makes execution events first-class, immutable, hash-chained records. Discrete simulation records decisions, order intents and fills with provenance; portfolio/accounting records resulting cash, positions and equity. The ledger has no broker authority.

## Controls

- Every capital-affecting event is traceable to a strategy/configuration and decision.
- Event order is deterministic and sequence-numbered.
- Hash checkpoints can be externally anchored for truncation/re-chain detection.
- Reference research backtesting remains unchanged.
- No credentials, broker order IDs, or network calls belong in the research ledger.

## Rationale

A backtest result alone is insufficient for institutional audit. Atlas must be able to reconstruct what was decided, what order was intended, what filled, what fee was charged, and what account state resulted.
