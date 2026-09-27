# ADR 0029 — Reconciliation and Fail-Safe Operation

**Status:** Proposed · 2026-09-03

Atlas treats account reconciliation as a control function, not reporting decoration. Cash and position mismatches fail closed and require investigation before further capital-affecting action.

The reconciliation contract compares Atlas and external account state with an explicit tolerance. It reports deterministic differences and never mutates either side to force a match.

A kill-switch state always dominates execution approval.
