# ADR 0025 — Cross-Engine Golden Reconciliation

**Status:** Proposed · 2026-09-03

Cross-engine validation proceeds in four independent comparisons: contract/decision, order intent, fill economics, and portfolio/equity accounting. Equality is asserted only where semantics and rounding are explicitly identical; otherwise a documented tolerance is required.

The existing LEAN golden fixture is the reference for discrete fill behavior. Atlas does not tune generic research costs to match one fixture.

A reconciliation failure is a release blocker for the affected execution mode.
