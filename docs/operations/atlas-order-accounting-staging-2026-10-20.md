# Atlas operational HAOR — virtual settlement accounting staging

## Release boundary
This change is a pure, importable **offline accounting candidate** at
`scripts/virtual_order_accounting_bridge.mjs`, **not** a new market feed or an
executing trading engine. No scheduled cron runner, provider request, broker
route, public financial state, or real-money permission is changed.

## Contracts tested

- Consume an explicit **FILLED** paper order from
  `scripts/virtual_order_lifecycle.mjs`, with exactly **one** validated
  modeled fill, known close time, fresh quote timestamp and modeled fees.
- Require a uniquely new two-hour completed bar (no time travel or missed
  checkpoint fill), one quoted instrument, a provider snapshot status and
  modeled price within 5% of the observed quote. No source inference.
- Validate existing five-account `SCHEDULED_VIRTUAL_PAPER` ledger, enforce
  virtual cash availability for BUY, exact owned quantity for SELL and
  preserve the other four accounts.
- Compute explicitly hypothetical quantity, virtual cash, modeled notional,
  fee, position cost, realized net SELL P/L, total fees, closed trade count,
  wins and marked virtual equity. BUY fee is already in cost basis and must
  not be deducted twice on SALE.
- Emit a candidate state and **pass it through the existing
  `assertNextCloudSnapshot` guard** before returning any result.
- Reject malformed history, repeated bar, stale quote, forged fees, cash
  overdrafts, over-selling and partial/cancelled orders.
- Emit `OFFLINE_HYPOTHETICAL_ACCOUNTING_CANDIDATE` plus explicit warning;
  no writes, no brokerage order route, no actual capital, and no deployed
  paper-trade events are produced by these tests.

## Deliberately unimplemented

- Source-proven, exchange-compatible partial fills across more than one
  completed market bar.
- Production runner order intent creation, persistence, idempotent cross-run
  fill IDs, and concurrent ownership locking.
- Automatically submitting modeled BUY/SELL based on newly analyzed bars.
- Any authenticated real data provider, NSE data feed or real-money broker.

**Never wire this module into the scheduled runner until source freshness,
ledger persistence, fee/cash alignment, crash-recovery and multi-event
accounting receive independent integration acceptance.**

## Coordination with Astra

Astra's quantitative research modules and data-contract files are
separately owned. This operational module only touches
`scripts/virtual_order_accounting_bridge.mjs`,
`frontend/tests/virtual-order-accounting-bridge.test.mjs`,
the existing UI test workflow and this documentation. Do not modify
`research/`, `tests/research/`, or `docs/research/`.

Current live paper JSON still reflects only actual GitHub runner attempts,
not this self-contained test fixture.

₹0 additional cost, real orders BLOCKED, no fabricated market results.
