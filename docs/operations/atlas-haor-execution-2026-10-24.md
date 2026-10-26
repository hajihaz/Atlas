# Atlas HAOR execution and release gate — 24 October 2026

## Objective and boundary

The target is a **virtual** ₹1,00,000 research-to-paper-trading workflow: source-stamped market observations, explicit technical/fundamental/news reasoning, risk-gated virtual orders, and an auditable paper P/L dashboard. It is not a broker account. Actual capital remains ₹0 and real-money order placement remains disabled. A model name, available plugin, historical backtest, community signal, or simulated fill does not establish an autonomous, profitable trading service.

This work started from PR #47's pinned `fcafecea947e4f27c7b42c6a5e6adb3a4e60f6a0` head in `/Users/hajihaz/projects/atlas-haor-npw-20261023`. The source branch and production environment were not modified during local acceptance.

## Owner-independent work completed locally

- Completed the local, loopback-only read-only `/api` adapter and Vite proxy. The adapter has a fixed route allowlist and reuses the deployed GET-only handlers. It does not add order routes or expose a private paper token. Local UI interactions exercised the proxy.
- Exercised the Live Paper Lab, IPO Intelligence, Strategy Lab, Research Lab, and ScalpStorm X in the in-app browser, Chrome Guest and Safari. Checked the phone-sized ScalpStorm layout and navigation. The Research Lab imported the repository's explicitly artificial fixture in the browser, displayed its test-only warning, and cleared it; it did not upload or certify the fixture.
- Mounted the previously unshown detailed ScalpStorm report, retaining its equal-allocation plan. It states **0/20** authenticated top-ten NSE stock replays, unknown stock P/L (not ₹0), no verified fills, and no broker execution. The signal filter now keeps its selected-day detail consistent.
- Fixed a time-dependent IPO assessment test by making the evaluation clock injectable. On a stale feed, the IPO footer now describes a stored, unverified NSE snapshot rather than claiming a connected live feed. Browser deadline reminders remain local and suppress stale or closed issues.
- Improved the public CoinDCX stream parser so non-target provider deltas do not cause a false 12-second timeout, while a later dead subscription still times out. **This does not make the browser stream live:** the provider returned HTTP 400 to WebSocket handshakes with Atlas browser Origins and 101 only for its own Origin in direct probes. Atlas must retain the labelled, slower public REST fallback; no origin-spoofing relay was added.
- Made the scheduled virtual-paper snapshot write atomic after its existing ledger validation. An injected rename failure preserves the prior JSON and removes its temporary file. Existing idempotent replay, publication-gap and source-provenance tests still pass. No new scheduled run, paper fill, or private token was invented.

## Local acceptance evidence

- Node: **401 passed, 0 failed** across frontend, scripts, research and NSE certification tests after the final stream-reconnect regression.
- Python with fresh isolated PostgreSQL 17 on `127.0.0.1:55443`: **578 passed, 1 skipped, 29 subtests passed**. The expected skip needs an unavailable authentic LEAN reference sample. The isolated server was stopped and its test directory removed; the owner's normal database was not used.
- TypeScript check, frontend build, Python Ruff and MyPy: passed. Advanced research certification: **101 passed, 0 failed**, `historicalPerformanceCertified:false`, `realOrdersEnabled:false`.
- HHC Git-source secret scan: **716 files, 0 findings**. Production npm dependency audit: **0 vulnerabilities reported**. The first PyPI audit timed out; a subsequent local OSV audit completed with **no known vulnerabilities found**.
- The Vite build still emits a nonblocking large-chunk warning. A complete automated cross-browser accessibility audit was not run; desktop and phone-sized manual interactions do not substitute for one.

## Hard release and source gates

1. GitHub Actions for PR #47 failed before executing steps with the account payment/spending-limit annotation. This blocks hosted exact-head CI and the scheduled paper runner. Do not pay, raise a quota, create a privileged runner, merge, or deploy automatically.
2. The exact-head Vercel preview must be READY and accepted separately; a green Vercel status context alone is insufficient. No production deployment is authorized until hosted CI and full acceptance are green.
3. ScalpStorm still needs permitted point-in-time NSE equity-universe membership, full opening-volume minute bars, later selected-stock OHLCV, source/rights evidence and cost validation before any 20-session stock P/L. Current certification remains **0/20**.
4. The browser WebSocket requires a provider-authorized Atlas Origin or another lawful free source. REST remains a truthful degraded mode; a custom origin-forging proxy would evade the provider restriction and is not an acceptable fix.
5. Fresh private cloud-paper publication requires the owner to restore hosted scheduling and, if private JSON is desired in the dashboard, install a narrow server-only Contents:read token. No Mac-wide OAuth token or browser-exposed token should be copied.
6. Model-directed virtual orders need an explicit model/provider authorization and cost cap, source freshness policy, independent risk gate, idempotent paper execution, and an audit trail. Atlas's current six-role council is deterministic explanation logic, **not six connected Claude/Grok traders**. Connecting a broker trading skill is outside this zero-real-money scope.

## Next pending work, split by owner input

**Without owner input:** keep the feature branch isolated; push only after fast-forward verification and clean local tests; monitor PR checks without merging; complete an exact-head preview smoke only if a free READY preview appears; expand automated keyboard/contrast checks; maintain source freshness and idempotency regression tests.

**Needs owner or external source:** resolve GitHub Actions billing/spending gate; provide lawfully usable authentic NSE history and point-in-time universe evidence; obtain provider-authorized browser streaming access or choose an allowed replacement; choose and authorize a model path within a specified zero/limited cost budget; optionally supply a narrow server-only read token for private paper; approve any later change to risk policy or release. Real-money trading remains deliberately excluded.

No historical NSE profits, creator-video returns, background paper fills, or exact-head hosted green CI are claimed here.
