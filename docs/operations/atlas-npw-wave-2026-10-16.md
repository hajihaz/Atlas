# Atlas NPW #1-#18: autonomous hardening checkpoint

Status: offline work only. Live capital remains BLOCKED. This tracked report preserves the owner's existing .ai/ and AGENTS.md changes.

## Implemented and locally tested

- Execution and chaos (#5-#6): durable broker-fill replay now checks ledger/account hash integrity and rejects changed duplicate order or fill details rather than silently acknowledging the event.
- Risk and reconciliation (#9-#10): reject non-finite risk limits, monetary balances, invalid tolerances/positions, malformed Upstox fills and contradictory broker trade IDs.
- Paper source authenticity (#4): require matching HMAC-authenticated market-session receipts signed by a separately trusted capture service. A unit-test receipt is not proof of a real external market session.
- Jarvis boundary (#16): read-only readiness/status projection explicitly forbids broker orders and live-mode changes.
- Historical data (#3): repeatable 100-session archived market replay regression in addition to the previously certified 30-session fixture.
- Monitoring (#15): offline drill verifies reconciliation-health blocking, persisted emergency halt across reopen, zero live orders and non-overwrite of preexisting operator halts.
- CI configuration (#17): updated GitHub workflow to use Python 3.11 and isolated PostgreSQL 17 service for both integration test URLs. Local configuration tests pass, but hosted workflow execution is not yet verified.
- Certification provenance (#14): manifest binds all new risk, broker, execution, attestation and monitoring source files plus CI configuration.

## Still pending or externally gated

- Full LEAN NUnit test-host stability (#1) remains blocked by intermittent upstream Python.NET GIL finalization failures. Narrow independent .NET compression smoke and Atlas LEAN golden fixtures are separate from full suite certification.
- More real LEAN fill/order fixtures (#2) and extended point-in-time corporate-action/out-of-sample market analysis (#3) remain.
- Broker order-state lifecycle atomicity, further power-loss chaos, restored production database access roles and cross-service isolation (#5-#8, #11-#12) require additional work.
- Local ephemeral PostgreSQL provisioning was blocked by HajiHaz Commander safety policy; it was not bypassed. GitHub-hosted Postgres job must be checked after push (#7-#8, #17).
- Authenticated Upstox lifecycle requires sandbox access (#13). No broker credentials have been provided or used.
- Real independent market-source receipt issuance and sustained broker-connected paper performance remain unverified (#4).
- Manifest signing requires an externally held signing key (#14). Operational alerts require deployed transport (#15). Actual Jarvis integration requires wiring into the app (#16).
- The owner's .ai/ tracker is not modified to preserve unrelated work (#18). This document records the verified subset instead.

## Safety

No real broker orders were placed; no production credentials, live-market data access, live-mode approval or compliance attestation were created. Explicit human authorization and all deployment, compliance, security, reconciliation and sustained paper-evidence gates remain mandatory before real capital.

## Further certified progress (next iteration)

- Added an actual .NET LEAN limit-order cancellation fixture, proving order events submitted -> cancelPending -> canceled, one original order, zero fills, no fees, no turnover and unchanged equity. Total LEAN golden fixtures: **4**.
- All LEAN fixture C# source files are now bound to the certification manifest hash, in addition to the Python runner and gate outputs.
- GitHub Actions run `38816622744` on `dc9ed8e` completed successfully: Python tests, real ephemeral PostgreSQL integrations, dependency audit and source secret scan passed. This independently resolves the previously unverified **hosted CI test execution** gate for that SHA. The local PostgreSQL provisioning policy remains respected.
- Live-capital trading remains blocked. The full LEAN NUnit suite, sustained broker-connected paper, compliant production deployment, and explicit owner authorization remain pending.
