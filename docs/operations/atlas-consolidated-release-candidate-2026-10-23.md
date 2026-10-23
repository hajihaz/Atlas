# Atlas consolidation — source-bound research release candidate

Date: 23 October 2026. Owner-approved HAOR, zero additional spending.

## Composition and isolation

This temporary review branch is cut from pinned GitHub `main` at
`56a40956e4ecc64b86ddf3c6bd86dbd872d9b909`, then merges **exactly**
the already reviewed and owner-authorized work from:

- PR #42 — owner-local advanced research JSON viewer, TradingView iframe
  isolation and an optional, server-only read-only private-GitHub cloud-paper
  snapshot endpoint.
- PR #45 — isolated NSE historical source acquisition/normalization/ranking/
  provenance/rights/certification pipeline and fail-closed daily/monthly/
  trade evidence exports.
- PR #46 — Vercel ignored-build safety gate to reduce redundant doc-only builds
  and, **only when private paper source delivery is genuinely configured**,
  paper-data-only builds.

Two textual merge conflicts were resolved without relaxation:

1. Existing .github/workflows/atlas-ui.yml retained *both* the advanced
   research and Vercel ignored-build tests.
2. The `frontend/vercel.json` CSP preserved the TradingView iframe
   permissions used by the safe sandboxed widget and added exactly the
   reviewed `ignoreCommand: node vercel-ignore.mjs`.

The owner Mac's active worktree, `main`, GitHub Actions workflow scheduling,
existing private credentials, cloud-paper JSON, IPO production snapshots,
Vercel production and any live-money trading API are **not touched**.

## Independent local acceptance — integrated branch

- Node: **391 passed, 0 failed** across `frontend/tests`,
  `scripts/tests`, `tests/research` and `tests/nse-certification`.
- Python with **fresh throwaway PostgreSQL 17** on localhost port 55439
  and separate DB `atlas_release_haor`: **578 passed, 1 skipped**,
  29 subtests passed. The skip requires an unavailable authentic LEAN
  reference sample; the throwaway PG process was stopped afterward.
- Separate focused Python NSE + ScalpStorm: **36 passed**, with one
  expected invalid ZIP fixture warning (tests intentionally exercise duplicate
  archive entries).
- `uvx ruff check`: PASS.
- `npm ci --prefix frontend`, `npm run check --prefix frontend`,
  `npm run build --prefix frontend`: PASS.
- `node research/advanced/certify.mjs`: **101 passed, 0 failed**,
  `historicalPerformanceCertified:false`,
  `realOrdersEnabled:false`.
- PR #45's source-evidence replay reproduced all four null-preserving
  report files byte-for-byte in a separate independent review.

The 391 Node and 578 Python counts already include the focused checks.
Do not add them together with the other PRs' individual totals.

## Data / money boundaries

- ScalpStorm X for 18 September–16 October: **0/20 authentic sessions**.
  Historical profit, daily return and per-stock fills remain **null**.
  Five public archive names are not verified market prices, as-of universe
  membership, rights or archival hashes.
- BTC/INR GitHub paper: most recent independently observed authenticated
  source-eligible checkpoint was run #17, five decision explanations, no
  virtual fills, actual capital INR 0, real orders disabled.
- The published Vercel static report may lag private GitHub. The optional
  read-only endpoint requires a fine-grained private repository Contents:read
  **server-side-only** token. No broad Mac OAuth token may be copied.
- Neither conditional build skipping nor a simulated execution may falsely
  report executable prices, source-certified NSE historical P/L or authorized
  account trading.
- NSE website terms, broker APIs' historical rights, publication-vintage
  evidence and source authentication are **hard external gates**.

## Release gates — never bypass

1. PR exact-head hosted GitHub Actions checks must turn green before a
   production merge. Current hosted jobs fail *before executing any step*.
   GitHub annotations cite failed recent account payments or the existing
   Actions spending limit; do not auto-pay, raise limits or install a
   privileged self-hosted runner.
2. Verify free Vercel preview READY at the candidate commit, plus authenticated
   homepage/API/source-money safety tests. Prior manual deploy APIs reported
   Hobby daily 100-deployment HTTP 402; no upgrade is approved.
3. Reconcile any new main/IPO/paper source commits; rerun all acceptance
   suites after the merge; preserve unrelated owner files. On release
   verify Vercel PRODUCTION SHA is exactly the source merged and every
   live research/IPO/market endpoint is source-accurate.
4. Owner may separately configure the narrow Contents:read-only GitHub token
   in the existing Vercel production server environment. Never paste
   credentials in chat or browser / VITE_* variables.
5. Authentic NSE historical stock-universe minute data is an external provider
   or licensed source matter. Do not waive that gate or fabricate gains.

The combined candidate reduces merge-conflict/integration and preview churn,
but **is not Atlas 100% or a green hosted-CI deployment**.
