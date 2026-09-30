# Atlas live-readiness runbook

This runbook is a gate checklist, not authorization to trade.

## Internal evidence Atlas can prove offline

- Strategy research evidence passed and promotion evidence is reproducible.
- Point-in-time data controls passed.
- Independent risk gate approved the intended exposure.
- Sustained paper evidence passed promotion requirements.
- Cash, positions, equity, and fees reconcile.
- Monitoring is fully healthy; degraded is not sufficient for live readiness.
- Persistent emergency halt/kill path has been tested.
- Atlas source/security and dependency audits passed.
- Production deployment artifact and durable persistence have been independently verified.

## External/owner gates Atlas must never self-assert

- Production broker/provider selected.
- Production credentials isolated in the approved secret manager.
- Compliance review completed for the intended jurisdiction/account/product set.
- Human authorization explicitly granted.
- Governance live mode explicitly enabled through the approved control path.

## Fail-safe response

Any unknown order state, stale market data, reconciliation mismatch, unhealthy monitoring, persistence divergence, credential ambiguity, dependency/security regression, or emergency halt blocks capital-increasing actions. Recovery requires resolving the cause and producing fresh evidence; restarting a process is not itself recovery evidence.
