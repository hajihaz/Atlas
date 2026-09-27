# ADR-0036 — Broker Order/Trade Reconciliation State Machine

**Status:** Accepted · 2026-09-03

Atlas treats broker submission acknowledgement as **not a fill**. Final accounting requires provider order state and trade observations. Unknown or malformed observations fail closed; valid trades are deduplicated by immutable provider trade ID before entering the Atlas accounting boundary.

Provider status is mapped conservatively. Unrecognized statuses become `UNKNOWN`. Partial fills remain partial until cumulative provider trades establish the executed quantity. Reconciliation must be performed before capital-increasing continuation after an ambiguous state.

No strategy code may consume provider observations directly, and no reconciliation function may invent fills.
