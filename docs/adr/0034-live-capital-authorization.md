# ADR-0034 — Live Capital Authorization

**Status:** Proposed · 2026-09-03

Live execution remains disabled after Step 29. Technical broker compatibility is not authorization.

Before activation, Atlas must have: a selected provider, isolated production credentials, approved market-data boundary, validated paper history, current evidence gates, configured risk limits, deterministic idempotency, broker/account reconciliation, operational monitoring, compliance/regulatory review, production deployment controls, kill-switch verification, and explicit human authorization.

The default broker implementation is `DisabledBrokerAdapter`; it deliberately rejects every submit/reconcile call. A future provider adapter must be separately reviewed and tested against the same contract.
