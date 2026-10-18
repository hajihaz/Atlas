# Atlas: read-only stock & crypto market observations (18 October 2026)

## Scope and trade-authority boundaries

This changes the Atlas **research observation** and public UI layers; it does **not**
create orders, account access, settlement, margin, permissions, exchange keys or a
broker order route. **Real-capital execution remains BLOCKED.** A public ticker is
not an execution-grade market-data feed. No P&L is calculated from these quotes.

### Supported data surfaces

- **Public crypto:** `frontend/api/market-quotes.js` is a zero-secret,
  fixed-destination, GET-only Vercel Function fetching the Kraken public
  ticker for BTC/USD and ETH/USD. No arbitrary URL, symbol or HTTP method
  is accepted. It uses a 5-second timeout, a 25-second in-process cache and
  an explicit quote-error state; prices must be positive and finite.
- **Truthful timestamp:** Kraken's ticker payload does not provide a guaranteed
  last-trade timestamp. Atlas reports **retrievedAt** as its own receipt time,
  leaves **observedAt** null, marks freshness `observation_time_unverified`
  and `paperEligible:false`. Receipt time is never disguised as trade time.
- **NSE equities:** The public dashboard shows RELIANCE, TCS and INFY as
  **private_connection_required**, with **no invented prices**.
  The private Python `upstox_private_stock_observation` adapter supports
  only one independently checked official example instrument,
  RELIANCE=`NSE_EQ|INE002A01018`. It requires an explicit OAuth token
  passed in process memory, authenticates only to Upstox's fixed quote
  endpoint, validates the matching instrument, positive numeric price,
  exchange last-trade timestamp and a 120-second freshness bound.
  It is **not exposed** by any public or unauthenticated web endpoint.
- **UI:** Market Watch is a distinct responsive sidebar page with honest
  status badges, explicit price-source and timestamp disclaimers, a manual
  refresh button, placeholders when offline, and permanent trade lock copy.

### Safety and product policy

- No browser/local storage, public endpoint, log, report or repository contains
  the user's broker credentials, or simulated broker credentials in code.
- The private Upstox adapter is **not** automatically connected, and licensed
  quotes are not redistributed on a public website. Owner-private access,
  appropriate exchange permissions, rate limits and incident monitoring are
  future gates for any private quote deployment.
- **Paper execution is blocked** here until the source has authenticated event
  timestamps, freshness checks, reproducible ingestion, independent risk
  authority, reconciliation and explicit approval. There is no hidden toggle.
- **Crypto public observations** do not certify strategy execution, exchange
  settlement or live trade eligibility.
- **No costs or additional subscriptions** required to introduce these
  adapters; API availability and access restrictions vary by provider.
- Optional open-source review: `ccxt/ccxt` (MIT, exchange integration),
  upstream `QuantConnect/Lean` and `freqtrade/freqtrade`. CCXT was
  **not installed** because its broad private trading surface and optional
  dependency footprint are unnecessary for this public read-only gateway;
  reconsider only with an isolated read-only wrapper, pinned reviewed version,
  license/security scan and no broker-write credentials.

### Reference contracts

- Kraken symbol and REST public endpoints:
  https://docs.kraken.com/api/docs/rest-api/get-ticker-information/
- Upstox official private read-only quote:
  https://upstox.com/developer/api-documentation/get-full-market-quote/
- Upstox verified instrument-key example:
  https://github.com/upstox/upstox-skills/blob/master/skills/upstox/references/market-data.md
- CCXT MIT repo:
  https://github.com/ccxt/ccxt
- Vercel Functions for Vite projects:
  https://vercel.com/docs/frameworks/frontend/vite

## NPWWMI #1–#12 reconciliation — engineering wave

| # | Workstream | Status and next proof |
|---|---|---|
| 1 | Python.NET crash | **Still upstream blocked**; prior 3/20 GIL crashes, do not claim repaired. |
| 2 | LEAN assembly lifecycle | Existing isolated diagnostics retained; upgrade work requires disposable upstream compatibility matrix. |
| 3 | LEAN dependencies | Audit pinned graph against old security report; never blindly install upstream fork. |
| 4 | Distributed atomicity | Existing broker/DB simulation and stale ledger rejection verified; real multi-service crash requires integration infrastructure. |
| 5 | SQLite/PostgreSQL recovery | Latest hosted CI physical backup/restore + deadlock verified; maintain tests. |
| 6 | Broker timeouts | Existing fake broker retry/idempotency tests; real callback/provider remains gated. |
| 7 | Historical/source data | New strict Kraken public and private Upstox observation interfaces with mock tests. |
| 8 | Liquidity/slippage | Existing synthetic stress model, never treated as real calibrated liquidity. |
| 9 | Emergency halt | Existing fail-closed durable controls unaffected; public API cannot request orders. |
| 10 | PWA/UI | New responsive Market Watch and source-status route; browser acceptance pending. |
| 11 | Reliability/soak | Cache/timeout/invalid-provider contract tests; long-duration soak not certified. |
| 12 | Security, CI and release | Python and JS unit tests plus CI. Deployment verification required. |

## Verification and acceptance checklist

- `node --test frontend/tests/market-quotes.test.mjs`
- `npm run check --prefix frontend && npm run build --prefix frontend`
- `python -m pytest -q tests/unit/test_market_observation_providers.py`
- `python -m ruff check src tests scripts && python -m mypy src/atlas`
- Branch pull request CI must pass both `atlas-ui` and `atlas-python-ci`
  before merging or publishing on Vercel production.
- Confirm `/api/market-quotes` serves public crypto only, stock quotes remain
  **private_connection_required**, no broker secret fields, no order API and
  UI degrades gracefully if external provider is unavailable.

**Owner/external gates:** authorized private broker and quote token, exchange
data rights/licence, non-public UI authentication, actual market feed freshness,
broker sandbox and compliance. These are not waived by this release.
