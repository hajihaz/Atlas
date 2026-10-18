# ScalpStorm X execution checkpoint — 18 October 2026

## Finite approved objective
Inspect Atlas; assess ₹0-first historical access; freeze and implement 20-session
(18 September through 16 October 2026) opening-volume point-in-time intraday
replay, ₹100,000 virtual capital, read-only Atlas preparation UI; never enable
real orders, incur costs, change existing user work, or publish speculative P&L.

## Evidence and milestone scoreboard (preparation campaign)
- [x] 15/15: inspected /Users/hajihaz/projects/Atlas, Git head, repository safety gates.
- [x] 10/10: official NSE calendar: 20 sessions, exclude 02-Oct.
- [x] 15/15: investigated zero-cost data vs Groww/Dhan subscriptions;
  NSE free daily bhavcopy **not** sufficient for 09:30 ranking.
- [x] 25/25: implemented fail-closed 1-minute local replay with source hashes,
  preopen-universe manifest, no future-volume leakage, fees/stop/slippage.
- [x] 15/15: added read-only ScalpStorm X React view with 20 session cards,
  genuine missing-data status and zero simulated financial claims.
- [x] 10/10: 495 Python unit/repro tests PASS, mypy module PASS,
  new files ruff PASS, frontend TypeScript/Vite production build PASS.
- [ ] 0/10: acquire independently validated, permitted full-universe 1-minute
  September/October 2026 feed; then run 20-day real-source simulation.
  Owner/external access gate. Without it, zero authenticated backtest sessions.

**Evidence-based scoped readiness: 90/100; not a strategy profitability score.**
This is **NOT 90% demonstrated profitability, nor 90% of a live trading system**.

## External gate (do not invent results)
A licensed/publicly permitted dataset with full coverage of NSE listed equities
and the as-of universe is still unverified. No Groww/Dhan API subscription was
purchased, and no account credentials were accessed. Community dataset
https://github.com/olo-labs/olo-ai-training-data-nse may offer 1-minute data,
but current date coverage, as-of membership and market-data rights are not
attested. Only use if those conditions pass.

Once usable data exists, validate timestamp/provider coverage, corporate actions,
universe as-of semantics, missing candles and symbol eligibility, execute full
20-day replay, separately reconcile one day manually, then export source-bound
P&L report. Never use existing SPY/AAPL archived charts as this result.
No active daily automation/live feed was started.

## Deployment and boundaries
No privileged order path, backend API, broker credential, network client or
private trading history was attached to the public Vercel UI. Only the public,
read-only preparation panel and offline executable were added.
Any future activation of authenticated feeds or running schedule is separately
gated by service credentials/account availability; live capital stays blocked.

## Git hygiene
Before this objective, the repository had unrelated modified AGENTS.md and
.ai/state.json and untracked .ai/* files. Preserve all. Stage/commit only
ScalpStorm code, tests, docs and frontend campaign additions.
