# ADR 0027 — Paper Trading Boundary

**Status:** Proposed · 2026-09-03

Paper trading is a separate runtime mode using the same discrete execution and risk contracts but synthetic/simulated fills. It is disabled by default and cannot silently transition to live.

Paper runs must capture snapshot, strategy/config, decision, order intent, fill, fee and account-state provenance. Kill-switch and risk rejection are terminal for the affected action.
