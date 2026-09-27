# ADR-0061 — Autonomous hardening and offline certification

**Status:** Accepted  
**Date:** 2026-09-27

Atlas now treats restart safety, external-event idempotency, persistent emergency state,
operational health, richer paper-broker failure scenarios, broker state transitions,
portfolio recovery, extended risk limits, and extended reconciliation as first-class offline
controls.

`./scripts/certify.sh` is the canonical engineering certification command. It runs lint,
compile checks, unit/reproducibility tests, full pytest discovery, the static authority/secret
audit, required-artifact checks, and Git whitespace validation under Python 3.11.

A PASS from this command is **not** live-trading authorization. Production broker selection,
production credentials, compliance review, sustained external paper evidence, human
capital authorization, and explicit governance live mode remain independent gates.
