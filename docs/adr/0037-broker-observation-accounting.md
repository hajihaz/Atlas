# ADR-0037 — Broker Observation Accounting

**Status:** Accepted · 2026-09-04

Validated provider trades enter Atlas accounting exactly once using immutable provider trade IDs. BUY/SELL direction is converted to signed portfolio quantity only at the accounting boundary. Each accepted observation creates a ledger event linked to the portfolio transition.

Broker cash, positions, and equity are compared with Atlas state using explicit tolerances. Any mismatch is a reconciliation failure and blocks further capital-increasing continuation. No broker observation can create an order.
