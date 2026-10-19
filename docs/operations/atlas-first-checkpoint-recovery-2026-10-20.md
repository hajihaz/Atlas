# Atlas scheduled cloud-paper first-checkpoint recovery

## Incident

The published `frontend/public/cloud-paper.json` remained `AWAITING_FIRST_RUN` with no run history. The scheduled runner previously exited without writing anything when its first CoinDCX source verification failed. This made *not run yet* indistinguishable from *attempted but no acceptable data*.

## Fix

When the first market data validation fails, store `status: AWAITING_VALID_SOURCE`, an actual `lastRunAt`, an incremented `runCount`, and a warning while retaining **zero positions, zero trades, no provider timestamp and no claimed profit**. Repeat attempts continue to preserve the failed-run journal. When a future valid closed 2h candle and fresh quote pass, initialize the five simulated accounts at the current observation only (no retroactive fills).

The Cloud Monitor now labels `Last runner attempt` rather than `Last verified check`, and distinguishes pending source validation from no scheduled attempt.

## Safety and acceptance

- No real brokerage API, NSE scraping, cost plan change or billable inference.
- Validate against the repository's `cloud-paper.test.mjs` plus all existing frontend/Python CI.
- A merge does not prove an actual scheduled run; verify a GitHub Actions checkpoint and the production `/cloud-paper.json` status before certifying unattended operation.
- The `schedule` is best-effort (every 2 hours at minute 17 UTC), not guaranteed timing or second-by-second trading.
- Do not record modeled trade returns unless source freshness and closed-candle gating pass.
