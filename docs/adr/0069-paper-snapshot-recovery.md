# ADR-0069: Replay-safe paper account snapshots

Status: Accepted for offline/test use. Live capital remains BLOCKED.

## Problem

The original paper snapshot persisted balances and the list of fill IDs but
reconstructed `PortfolioAccount` with an **empty transition history**. A
restarted account could then accept a duplicate fill ID and apply the same cash
or position change again. The former snapshot also relied solely on an account
snapshot hash, not the corresponding immutable ledger fill payload.

## Fix

- Snapshot schema v2 stores full fill transitions and verifies them against
  the independently hash-checked ledger: order identity, instrument, signed
  quantity, price, fee, cash, and equity at each fill.
- Restore reconstructs and validates each sequence/cash/position transition;
  duplicate identities fail closed. Nonfinite values and contradictory
  transition identities fail.
- Snapshot writes use a private atomic replacement with fsync and a directory
  durability barrier. Tests abruptly terminate a child process after commit,
  then recover and verify idempotency.
- PaperRuntime computes new fills against private staged state and publishes
  only after all fills, valuation, and ledger checks succeed.
- Current portfolio weights and a retained peak equity are sent into RiskGate
  so turnover/drawdown limits work across sessions. After restart, peak equity
  is reconstructed from the trusted ledger, not reset to the current balance.
- Consistency checks reject forged health reports with missing/duplicate
  signals or misleading status.

## Compatibility and limits

V1 snapshots with no fills may be loaded for safe continuity. **Legacy V1
snapshots with fill IDs are refused** because there is insufficient trusted
history to reconstruct transitions. They require deliberate owner-reviewed
migration from independently verified broker or ledger event history; Atlas
will not silently drop the fill registry.

This remains paper/offline infrastructure, not an authenticated live-broker
account or an end-to-end production database transaction. No live mode is
activated by this change.
