# Atlas zero-extra-cost Vercel build gate

Date: 2026-10-23. **No change to authenticated NSE, crypto paper logic, or real-order policy.**

## Why

Atlas's connected Vercel Hobby project has a documented per-day deployment quota; on 23 October the deployment API and scoped CLI returned `402 api-deployments-free-per-day`. Separately, GitHub Actions may update only `frontend/public/cloud-paper.json` multiple times daily. Deploying a full static website just to publish a new virtual checkpoint consumes deployment capacity, yet Vercel can remain on an older snapshot after the quota is exhausted.

The safe long-term delivery method is the bounded, **server-only** GitHub Contents:read `/api/cloud-paper` endpoint developed in Atlas PR #42. It is **inert without** an owner-installed, fine-grained `ATLAS_PAPER_READ_TOKEN`. The browser uses the last deployed read-only ledger with a prominent freshness label if that route is unconfigured or unavailable.

## Implementation

The project's `frontend/vercel.json` now contains `"ignoreCommand": "node vercel-ignore.mjs"`. Vercel runs it from the configured `frontend` root. Per [Vercel's ignored-build documentation](https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel), exit **0 skips** a build, while exit **1 continues**. This does not evade the provider quota or guarantee that ignored attempts consume zero quota. Actual provider semantics and post-release outcomes must be verified.

`frontend/vercel-ignore.mjs` uses repository-root paths from a single, known parent-to-HEAD Git diff. It fails **open to building** on shallow-history errors, ambiguous/missing changed paths, unknown deployment environment or explicit `ATLAS_FORCE_BUILD=1`.

- Changes *only* to README and `docs/**` may safely skip a frontend build.
- Changes *only* to `frontend/public/cloud-paper.json` or `frontend/public/cloud-paper-daybook.json` may skip **only after** a valid server-only `ATLAS_PAPER_READ_TOKEN` is configured. Otherwise build to preserve the existing static data publication path.
- Any change involving IPO snapshots, financial code, strategy engines, api routes, JavaScript/TypeScript, CSS, security policy, workflows, tests, package manifests or `frontend/vercel.json` **always builds**, regardless of the token.
- Only exact allowlisted paths can skip. No archive, glob or substring shortcut is used.
- Do not log, commit or expose the GitHub token. Never place it behind a `VITE_` prefix.

This is a release-capacity optimization, not an alternative to GitHub CI or an excuse to display stale IPO information. It is not deployed until GitHub and Vercel free gates clear. Do **not** enable deployment by changing the Vercel plan, payment method, or budget.

## Acceptance

1. `node --test frontend/tests/vercel-ignore-build.test.mjs`: verifies skip-when-safe, no-token fallback, all IPO/code changes building, ambiguous data failing open, and real Git diff behavior from `frontend` root.
2. Validate `npm run check --prefix frontend` and `npm run build --prefix frontend` plus existing suite.
3. Require exact-head green hosted CI and a READY free preview before merge, or retain PR awaiting the current GitHub account Actions payment/spending gate and Vercel quota reset.
4. On a subsequent legitimate production release, test a docs-only commit is ignored; a code/IPO commit builds; and a cloud-paper-only commit builds until the private server token is set. Once configured, verify that the browser's fresh private ledger remains source-correct when the data-only deployment is ignored.

The existing real-money lock remains `realOrdersEnabled: false`, `actualCapitalINR: 0`. The live paper source has actual run #17 with no modeled fills and no new skipped interval. No performance or availability claim is inferred from this change.
