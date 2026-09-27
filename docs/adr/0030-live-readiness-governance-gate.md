# ADR 0030 — Live-Readiness Governance Gate

**Status:** Proposed · 2026-09-03

Live capital is a distinct governed state, never a side effect of passing tests. A live execution action requires: validated strategy evidence, current point-in-time data, risk approval, human approval, enabled live mode, successful reconciliation and an inactive kill switch.

Failure of any prerequisite denies execution. Automated AI or Jarvis orchestration cannot bypass the gate.

Provider/broker selection, credentials, limits, regulatory review and production deployment remain explicit external approvals and are not implied by this ADR.
