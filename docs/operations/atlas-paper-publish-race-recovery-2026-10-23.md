# Atlas cloud-paper main-branch publication race recovery

Date: 2026-10-23. Production operating mode: public-source BTC/INR
**research-only**; real orders disabled, actual capital ₹0.

## Observed problem and finite fix

The preceding Actions workflow computed one source-gated paper report from its
checkout, then refused to push if main advanced. This was safe against overwrites
but dropped the entire scheduled opportunity during frequent UI/IPO changes.

A single scheduled Actions job now invokes `scripts/publish_scheduled_paper.sh`:
- Refuses execution outside a GitHub Actions research-only workspace; never
  resets the owner's normal local Mac repository.
- Fetches the current remote `main` and resets **only the ephemeral CI checkout**
  before each attempt.
- Reruns the existing full provider check, 55-completed-bar gate, decision
  evidence, fill/order accounting and append-only continuity validation.
- Stages and pushes only `frontend/public/cloud-paper.json`.
- On a rejected push, checks whether remote `main` truly advanced. Only then
  discards the **unpublished** candidate and retries with fresh source data.
- Stops after three attempts. Auth/permissions failures without a newer remote
  commit fail closed immediately; no force push, cherry-pick, ledger merge,
  synthetic backfill or market-order endpoint is allowed.

The best-effort cron remains two nominal runs per 2-hour candle (24 per day).
Retries are inside one existing 4-minute job, not extra scheduled jobs. They
may consume some extra included Actions minutes/source calls, which remain
subject to GitHub's free quota; they do not guarantee `₹0` if a wider account
exceeds its included quota. Never automatically upgrade plans.

## Synthetic acceptance

`node --test scripts/tests/paper-publish-race.test.mjs` uses a private
temporary bare Git remote and separate job/actor clones. The intentionally
artificial runner increments a counter, **not** a financial position.
Tests prove:
1. Owner-machine/non-GitHub invocation rejected before code changes.
2. Another actor commits while the first candidate is pending: first push
   rejects, new candidate rebuilds against latest data, original actor commit
   survives, and the published report advances exactly once.
3. An unrelated push/permission failure produces no repeated source calls,
   no remote changes and no retroactive entries.

The actual BTC/INR simulated trading engine, source, schedule, credentials,
existing cloud ledger, risk thresholds, price calculations and P/L are
**unchanged**. Real operational acceptance still requires a future genuine
source-accepted consecutive 2-hour checkpoint to persist strategy decisions.
