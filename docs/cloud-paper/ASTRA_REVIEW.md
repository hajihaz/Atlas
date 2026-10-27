# Atlas Cloud Paper Desk — Astra patch/review handoff (2026-10-27)

## Objective and current evidence
- Owner approved persistent Groww-style scheduled **paper** orders with independent 24/7 worker and 09:40 IST NSE volume strategy. Real-money brokerage routes stay categorically disabled.
- Implementation branch: `haor/atlas-offline-cloud-paper-20261027`, forked from `origin/main` (56a4095). Existing Atlas main and other in-flight worktrees untouched.
- Source: `src/atlas/cloud_paper/{engine,server}.py`, authenticated same-origin owner proxy at `frontend/api/cloud-paper/[...segments].js`, UI `frontend/src/components/CloudPaperPage.tsx`, persistent-container build `deployments/cloud-paper/Dockerfile`.
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
