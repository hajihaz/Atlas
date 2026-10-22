# Atlas virtual paper: source-honest strategy decision explanations
Date: 2026-10-23. Safe operational extension; no new market connections.

## Evidence from genuine runs
On 23 October the public research ledger had 16 published checkpoints
(including 14 source-coded recorded attempts), with nine source-accepted
observations but 28 cumulative missed two-hour intervals. The five
independent ₹100,000 virtual strategy accounts had zero forward modeled
fills and zero historical claim of profits. This is not evidence that all
five strategy algorithms are broken; entry rules may not fire, an exit
signal can occur while a virtual account is flat, and scheduled GitHub
jobs may miss eligible bars.

## What this code implements
- Deterministic source-only explanation after `sourceEligible` and
  `advanceCloud`; uses the existing signal function and only the
  already computed modeled events.
- Each virtual strategy's `lastDecisionEvidence` identifies if a
  checkpoint seeded the account, repeated a completed bar, skipped
  missed bars without backfill, was risk-halted, found no qualifying
  signal, observed a SELL signal but had no virtual position, found a BUY
  signal while holding, or generated a verified hypothetical model fill.
- Explaining **why no simulated trade was recorded** never changes
  cash, entry/exit rules, modeled fees, actual ledger fills, signal
  thresholds, the clock, or price source; the function merely labels
  the outcome already determined by the existing paper engine.
- On a market-source failure, the previous five portfolios, including
  the last verified decision trace, remain untouched.
- The trace is from the latest source-validated checkpoint only.
  UI distinguishes it from a newer failed/degraded checkpoint.

## Deliberate limitations
- Some BUY signals may produce no modeled fills due to the existing
  cash and quantity restrictions. This is labeled independently and
  is never converted into an order merely to produce P/L.
- Missing GitHub Actions schedules are best-effort and cannot be
  reconstructed or backfilled; a count of 28 skipped intervals is
  evidence of a gap, not 28 hypothetical losing or profitable trades.
- This does not enable trading on all five crypto markets (currently
  the cloud forward paper ledger is BTC/INR for five strategies).
- This does not connect broker accounts, new NSE APIs, pay for
  infrastructure, insert sample prices into the live ledger, or alter
  Astra's separate advanced research PR.

## Acceptance gates
Run new unit tests for seed, same-bar retry, RSI SELL without holdings,
missed intervals, degraded-source immutability, fake BUY injection,
frontend TypeScript checks and existing Python/PostgreSQL CI.
Inspect exact GitHub commit before merge. The feature is only
production-verified after the matching Vercel revision serves
cloud-paper.json and the next real runner appends authentic decision
metadata. Never claim a real modeled fill from synthetic fixtures.

**Zero new costs. Zero real market orders.**
