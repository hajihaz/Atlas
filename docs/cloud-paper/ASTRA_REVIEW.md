# Atlas Cloud Paper Desk — Astra patch/review handoff (2026-10-27)

## Objective and current evidence
- Owner approved persistent Groww-style scheduled **paper** orders with independent 24/7 worker and 09:40 IST NSE volume strategy. Real-money brokerage routes stay categorically disabled.
- Implementation branch: `haor/atlas-offline-cloud-paper-20261027`, forked from `origin/main` (56a4095). Existing Atlas main and other in-flight worktrees untouched.
- Source: `src/atlas/cloud_paper/{engine,server}.py`, authenticated same-origin owner proxy at `frontend/api/cloud-paper.js`, UI `frontend/src/components/CloudPaperPage.tsx`, persistent-container build `deployments/cloud-paper/Dockerfile`.
- Owner-only API requires distinct secret tokens for order control and private quote ingestion. Credentials are not bundled or stored by the browser. Owner-token proxy deliberately cannot ingest quotes.
- SQLite WAL + BEGIN IMMEDIATE serializes work and survives process restarts on a **persistent** volume; scheduled single-shot orders have client idempotency keys. Skip, never backfill stale/missed orders.
- Verified gates: dated ISO-8601 schedule, market hours, fresh trusted source quote <=15 s, full authenticated 500+ eligible stock snapshot before ranked entries, Nifty directional signal ±0.2%, neutral no trade, 10 positions with ₹10k each notional, 2% stop, exits at 15:15 IST, no synthetic pricing in production, source-gated INR mark-to-market, integer paise + modeled 10 bps fees / 5 bps adverse slippage.
- Unit checks: 18 Python test cases, owner HTTP smoke, 3 owner proxy tests, frontend build and tsc, ruff and mypy on affected Python package. All these currently pass.
- Broad unscoped Node frontend test sweep exposes unrelated existing IPO stale-source assertions (2 failures); those files were not changed by this branch.

## Astra security/quality review focus
1. Check short-selling accounting and recovery when an exit quote is missing; simulate adverse price gaps and insufficient virtual cash on short cover.
2. Verify strategy clock, date rollover, duplicate worker requests, persistent-session retries, SQLite transaction isolation, and market holiday behavior.
3. Confirm API token treatment, same-origin owner proxy allowlist, input validation, HTTP response safety and CSP compliance.
4. Confirm that all market-data limitations are disclosed: no legally authorized/full-universe NSE quote collector connected, no cloud worker/persistent disk presently deployed, and no actual exchange order matching or liquidity certification. Do not label hypothetical fills as verified real trades.
5. Review static types, tests, owner UI responsive states, and how owner can monitor misses/open positions and disarm.
6. Ensure this branch can merge cleanly alongside concurrent Atlas strategy, IPO and Upstox work without overwriting them.

## Actual production owner/infrastructure gates
- A legally permitted, timestamped and full-coverage NSE intraday equity/Nifty provider. Provider and feed rights are **not** supplied in this branch. Never source from fabricated/forward-looking data.
- An always-on, persistent disk container endpoint with TLS and owner/feed secret provisioning. Vercel's existing Vite frontend is stateless and does not itself run the worker. No unapproved spending or backend deployment was performed.
- A production deploy of the worker, Vercel server-side `ATLAS_PAPER_BACKEND_URL`, deployment/health validation across a real market session, and final owner acceptance.

## Must not do in patch pass
- No real-money broker calls, no missing-data backfills, no synthetic figures represented as real, no broad unsupervised main merge, no paid hosting without owner decision.

## Next safe action
- Review patch diff and unit tests, repair any fail-closed/short-accounting bugs, validate GitHub PR preview/CI. Leave owner data-feed and persistent hosting issues visible and isolated rather than inventing availability.


## 2026-10-27 free-cloud alternative addendum (Cloudflare)

- New independent backend at `deployments/cloudflare-paper/`, standalone Worker + D1 free-tier minute Cron. Do **not** run it alongside the Python SQLite engine on the same virtual trading account. This is a deployment alternative, not an activation.
- Schema `schema.sql`; time-zone/date validation, bearer-token owner and feed separation; exact `FEED_SOURCE_ID` attestation and mandatory complete NSE stock coverage gate; D1 transactional batch with unique execution ID and position/cash guard; skipped late orders; strategy direction and minute stop/exit checks.
- Local Wrangler tests: 3/3 JS unit checks, live local D1 virtual fill with fee/cash accounting, stale order skip/no backfill, and two concurrent Cron invocations produced exactly one additional virtual fill. No actual cloud or source-backed test yet.
- Quota controls: once-daily full-universe snapshot at 09:39–09:40 IST, <=30 stocks ordinary updates, 12-second minimum quote persistence gap. Free-tier D1 quotas and Workers CPU still need monitored validation.
- Owner gate: `wrangler login` OAuth opened in the Mac browser, but CLI is **not authenticated**. D1 remote create, secret injection, and deployment cannot run without completed authorization. Do not disable any protection or invent an account.
- Integration owner gate: licensed timestamped NSE + Nifty feed not supplied, so do not activate or advertise unattended market trading. No real broker orders.
- Astra review should specifically inspect Cloudflare D1 `batch` atomicity, concurrent cron/update race, short exposure accounting and time-of-quote-source propagation. Minute Cron + 15-second quote TTL means missed triggers must fail closed. Review account quota/exchange holiday cases before any production release.

### Oct 27 — targeted free-tier efficiency patch

- Full NSE quote ingestion was optimized to cache shared ISO/IST session checks and to pack 500–4000 records into one `json_each()` D1 statement, plus one coverage update in a transactional batch. This avoids exceeding the **50 D1 query invocations** limit; individual row-write quotas and 10 ms Workers Free CPU limit still apply.
- The order-fill path now reads quote/position/cash via one joined query and verifies the cash, holdings, timestamp, and short-exposure preconditions in its guarded settlement transaction. Protective STOP and EXIT orders are eligible for a within-window retry if a preceding attempt skipped solely for a stale quote.
- A local D1 fixture verified the compact `json_each` UPSERT syntax, simulated paper settlement after Cron, and exactly one recorded fill. 10/10 targeted Cloudflare tests pass. Remote CPU and end-of-day 10-position exit-load certification remain pending account access / authenticated NSE feed.

### Oct 27 — single-write settlement follow-up

- Cloudflare D1 schema now contains an `AFTER UPDATE` ledger trigger for `QUEUED → FILLED`, replacing the separate Worker account/position/event writes. The guarded order UPDATE is the sole state-changing settlement statement.
- Local Wrangler D1 test confirmed fee+price cash debit exactly once and an unchanged balance/audit on repeated Cron. Independent Python SQLite regression: 3 tests for replay, paper short/cover, and negative-cash rollback passed (21 Python tests total with original engine).
- Review trigger presence and schema migration ordering carefully: deploying Worker code against a D1 schema without the trigger would cause an unbalanced virtual ledger. Schema must be applied before the new Worker is deployed. No remote deployment has occurred.


### 2026-10-27 D1 free-tier transaction patch for Astra

- Added `atlas_settle_paper_fill` in `deployments/cloudflare-paper/schema.sql`: `UPDATE orders ... RETURNING` must atomically fire a trigger updating cash, positions and audit events. Review the status `QUEUED` -> `FILLED` guard, unique execution ID, short-exposure guard, integer-paise arithmetic, and transaction rollback.
- Quote ingestion uses `json_each` with bound JSON rather than hundreds of D1 statements. Verify maximum input size, provider authority, eligibility counts, 50-query free ceiling, and 10 ms CPU ceiling.
- Verified local Wrangler D1: 600 test symbols with one insert; manual BUY fill; paper SHORT ENTRY and BUY-to-cover EXIT returned holding to zero with exact ledger fees; no real orders.
- Cron scheduling is minute-resolution and best-effort; 2% stop signals and fills are not guarantees. Protect against delayed cron, stale quotes and skipped manual-order backlogs.
- **Owner gate unchanged:** Cloudflare OAuth still unauthorized on last `wrangler whoami`; no live Worker deployed or authorized NSE/Nifty feed connected.


## Upstox provider candidate (2026-10-27)

Added pure `deployments/cloudflare-paper/src/upstox-adapter.js` to map one authenticated V3 500-equity snapshot + Nifty quote to D1 ingest. Fails closed for missing instrument, old source timestamps, stale top-10 price trades, unverified access, or Nifty benchmark mismatch. Only a nominated 500-stock eligible subset, NOT the entire NSE market, may be ranked. No token, live quote access or trading API has been connected. V3 provider limit is 500/request. Before activation, audit data redistribution/contractual use, provider token refresh, full eligible-universe selection, quote receipt timing vs last-trade timing, and holidays.


## NPWWMI paper collateral safety verification (2026-10-27)

- `deployments/cloudflare-paper/src/index.js` now prevents treating proceeds from paper short sales as spendable buying power for unrelated BUYs; reserved gross short entry proceeds are checked in the same atomic guarded settlement update as the cash balance. Short-covering BUYs remain possible; an order trying to reverse a short into a long is rejected.
- SQLite-backed Node tests in `deployments/cloudflare-paper/test/short-collateral.test.mjs` verify overspend SKIPPED, short cover, reversal denial, normal buy, complete ten-stock 09:40 long and short strategies, a 15:15 short cover, and per-invocation D1 query budget. All values are synthetic.
- Note: Reserved entry-price proceeds do **not** equal real brokerage margin, and the price/adverse gap risk remains; do not treat this ledger as an exchange-certified trading simulator. The free Cron service is still undeployed until Cloudflare OAuth and licensed NSE/Nifty feed gates are cleared.


## 2026-10-27 Cloudflare deployment status (public Worker, no feed)

- Authenticated Wrangler using official Cloudflare device OAuth; credentials stored encrypted with key in macOS Keychain.
- Created Cloudflare Free D1 in APAC, deployed `schema.sql` (8 tables) with no orders, and published `atlas-free-cloud-paper` on `kuddosahib.workers.dev` with once-per-minute Cron. D1 binding UUID tracked in `wrangler.toml`; there are **no hard-coded credentials**.
- Required `OWNER_TOKEN` and `FEED_TOKEN` Worker secrets were **not configured** during this run. Treat all protected API routes as unavailable; do not enable strategy until secure tokens, host reachability, and authorized NSE/Nifty feed are proven.
- Upstox Developer Apps redirected to mobile OTP login; do not bypass login or claim market-data rights. Official Upstox V3 quote API requires a bearer token, maximum 500 instrument keys per request, and standard tokens expire at 03:30 IST the following day. Atlas provider adapter remains unconnected.
- Cloudflare Worker endpoint did not pass HTTPS handshake from the connected Mac at initial smoke; inspect propagation and external connectivity before calling it healthy. Vercel backend URL is scoped to the Atlas PR Preview environment only, not Production.
- No real-money orders, live market quotes, purchases, or billing-plan upgrades. GitHub Actions still have external billing gating.
