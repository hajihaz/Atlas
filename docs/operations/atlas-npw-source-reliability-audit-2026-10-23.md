# Atlas HAOR — source reliability, publication diagnostics and Research Lab coverage

Date: 23 October 2026. Isolated branch from combined release candidate PR #47, no production changes. Scope: owner-independent Atlas NPW security, paper monitoring, research transparency and UI regression tests.

## What actually changed

1. `paperCadence.js`: compute the number of *nominal scheduled GitHub publishing opportunities* that passed their existing 45-minute grace, **since the last saved ledger, bounded to the most recent 48 hours**. Neither an unpublished slot nor a passing scheduler predicts provider connectivity, authentic candles, signal occurrence, fills or GitHub runner failure. Future, missing or malformed timestamps never produce a forged count.
2. `CloudPaperCard.tsx`: make publication overdue explicit; show the bounded unpublished-slot count separately from the ledger's existing, independently recorded `skippedIntervals`; link the exact scheduled GitHub workflow for owner inspection. On a later refresh failure, retain only the last independently validated saved report and visibly warn of the failed refresh. Responsive cards and keyboard-visible link focus preserve existing layout/theme.
3. `api/cloud-paper.js`: re-use the established browser/daybook validation before serving any alleged source-authentic private GitHub JSON. Beyond GET-only/read-only restrictions, reject impossible equity observations, event chronology, duplicate strategies, nonmonotonic/forged checkpoint evidence and incorrect win counts. The server-only GitHub read token is never returned or logged; the endpoint continues to fail safely with 503 if unconfigured.
4. `StrategyLabPage.tsx`: explicitly show the provider's own history-completeness caveat, source warning, count of **completed** provider bars and last closed bar time adjacent to historical simulated returns. Do not turn partial provider history into fake total coverage, NSE top ten, historical executions or forward paper activity.

## Local tests and source evidence

- `node --test frontend/tests/*.test.mjs scripts/tests/*.test.mjs tests/research/*.test.mjs tests/nse-certification/*.test.mjs`: **397 passed, 0 failed**; tests include new edge cases for overdue counts, invalid clocks, last-refresh outage, source ledger validation and history coverage notice.
- Full Python suite on a newly initialized isolated PostgreSQL 17 DB at localhost port 55441: **578 passed, 1 skipped**, 29 subtests. The skip is for an unavailable real LEAN reference sample. Test PostgreSQL stopped after the run; no owner DB touched.
- `npm run check --prefix frontend`: PASS; `npm run build --prefix frontend`: PASS; `uvx ruff check`: PASS; `node research/advanced/certify.mjs`: **101 passed, 0 failed**, with `historicalPerformanceCertified:false` and `realOrdersEnabled:false`.
- Vite emitted a nonblocking JS chunk-size warning; code splitting is an optimization opportunity and is not presented as a failed security gate.

## Still blocked externally / not claimed

- GitHub Actions pre-run payment/spending gate affects CI and scheduled paper. The exact scheduled job run `39885037166` on 23 October 2026 UTC failed without steps, independently confirmed by runner annotation. The source-backed cloud ledger most recently contains **run #17** and **no modeled fills**. Counted publishing opportunities must not be relabeled as failed GitHub jobs or true missed trades.
- No green hosted exact-head CI or exact-head READY Vercel preview was confirmed for the candidate. No source-mismatched preview or manual Vercel API quota bypass is authorized. Keep candidate unmerged.
- NSE 20-session ScalpStorm historic data: **0/20 certified**, historical stock P/L unknown/null pending dated full equity universe and permitted minute data. Five archive filenames cannot prove stock membership, prices or usage rights.
- Fresh private cloud paper requires owner-installed narrow GitHub Contents:read server environment token. No paid services, credentials disclosure, broker orders or real-money trading changes.

This report describes verified NPW sub-work; it does not assert that all Atlas NPW #1–#8 or the whole trading platform is complete. Additional UI/browser acceptance and provider data certification are separate release stages.
