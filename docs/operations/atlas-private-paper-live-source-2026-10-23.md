# Atlas private-repository cloud-paper freshness: no per-ledger Vercel redeploy

Date: 2026-10-23 · Research-only. **Real-order authority remains disabled.**

## Why this is needed

At 2026-10-23 00:29:15 UTC the actual GitHub paper ledger advanced to
`runCount: 17`, status `RUNNING`, using a source-verified BTC/INR completed
two-hour candle. All five strategies produced authentic decision explanations.
The last production Vercel build still served run 16 because the free project
exceeded its daily 100-deployment API quota. GitHub repo `hajihaz/Atlas`
is **private**, so the browser cannot read its raw ledger anonymously.

This delivery gap is independent of trading logic. Zero hypothetical fills
were honestly recorded (four HOLD; one SELL without holdings).

## Implemented without external credentials

- Fixed Vercel serverless GET route `/api/cloud-paper` can read only the
  `main` branch, `frontend/public/cloud-paper.json`, from GitHub's REST
  Contents endpoint. No client-controlled repository, path, branch or method.
- Requests include a **server-side-only** `ATLAS_PAPER_READ_TOKEN` env var,
  a fixed Accept and API version, and a 6-second abort timeout.
- The bounded 140KB response is checked for research-only schema, source
  time, 0 real capital, no real orders, finite account values, bounded model
  events and consistent append-only checkpoint counters.
- Invalid, unauthorized or unavailable responses return only generic HTTP
  503 with no secret, underlying provider exception or private repository
  payload. Mutating HTTP methods return 405.
- Successful sanitized read-only snapshots may use 90-second CDN caching;
  no token is ever sent into browser JS, static bundles or URLs.
- React first attempts this same-origin server route, then the historically
  deployed `/cloud-paper.json` if the route is unavailable or returns HTML
  from a local development router. The fallback is visibly labeled
  **LAST DEPLOYED SNAPSHOT**.
- Client validates each report as before and refuses to replace a previously
  observed higher `runCount` or newer same-run timestamp with an older
  fallback. It does not fabricate intervening checkpoints or fills.

## Verified local execution

A single local process with an already-authorized GitHub CLI session passed
its existing token **in memory only** to the fixed read-only function.
It retrieved the genuine private repo ledger (run 17, source ELIGIBLE,
correct five strategy decisions, realOrdersEnabled false, actualCapitalINR 0).
No token was printed, embedded in code, saved to disk or uploaded to Vercel.

`node --test frontend/tests/cloud-paper-private-endpoint.test.mjs`
covers source URL/HTTP method, no-token failure, unsafe financial records,
future/inconsistent checkpoint proofs, oversized malformed data and no
credential leakage. Full Node/TypeScript/Vite tests also required.

## Two external owner gates

1. The owner must create a **fine-grained GitHub token** restricted to
   repository `hajihaz/Atlas` and **Contents: Read-only**. It must NOT have
   Contents:write, Actions:write, repo-wide administration or trading scopes.
   Store the credential privately as `ATLAS_PAPER_READ_TOKEN` under the
   existing Vercel project's production environment. Never paste the token in
   chat or browser UI; never repurpose the broad Mac CLI token.
2. The Vercel Hobby daily deployment limit must reset. On 2026-10-23 both
   its API and scoped CLI preview attempts returned
   `402 api-deployments-free-per-day`. No paid plan/credit purchase is
   approved. Retest from the existing free project after reset.

The route is inert (HTTP 503) without the narrowly scoped server token.
Once configured, smoke-check unauthenticated `/api/cloud-paper` from the
public app: HTTP 200, source ledger runCount at least 17 and newest public
source evidence, while independently checking it matches current GitHub.
Validate that static `/cloud-paper.json` can still lag without overwriting
the newer authenticated response and verify the UI's delivery label.

A production read-only source with 90-second CDN cache is NOT a guaranteed
one-second market stream and does not remove GitHub cron scheduling limits.
It consumes included Vercel Function/GitHub API quotas; cap traffic, monitor
usage and never auto-upgrade or authorize spending.
