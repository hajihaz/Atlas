# Controlled live rollout

Status: design only; live capital is blocked.

A future rollout is permitted only after `LiveReadiness.assert_ready()` succeeds from production evidence and a separate explicit human authorization enables governance live mode.

Stages:
1. Read-only production observation: market/broker reads and reconciliation only; zero order authority exercised.
2. Sandbox replay of the exact production artifact and configuration.
3. Human-authorized minimum-exposure canary with strict single-position/notional/session limits and persistent emergency halt armed.
4. Reconcile every broker observation, fill, fee, cash balance, position, and equity state before any subsequent exposure increase.
5. Automatically halt on unknown order state, stale data, health degradation, persistence divergence, reconciliation mismatch, dependency/security regression, or emergency signal.
6. Expand limits only through a new evidence package and explicit human approval; never automatically scale because a canary succeeded.

No stage may bypass risk, execution, reconciliation, journal, monitoring, or governance boundaries.
