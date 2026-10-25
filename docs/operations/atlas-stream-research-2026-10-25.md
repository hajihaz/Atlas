# Atlas streaming, research and source acceptance — 25 October 2026

Approved scope: execute the eight reconciled Atlas pending items, excluding Upstox, and the first useful repository batch. Additional spend remains ₹0. No real-order capability was enabled.

## Delivered

- Public Kraken v2 trade stream for BTC/USD, ETH/USD, SOL/USD, XRP/USD and DOGE/USD. The UI samples actual trades once per second, retains provider timestamps, expires displayed prices after 90 seconds, reconnects with bounded backoff and rejects stale, duplicate, out-of-order and obsolete-socket events. USD prices remain separate from INR observations and paper accounting.
- The same adapter received 111 real trades across five assets in a 190.003-second Mac soak. A forced disconnect recovered to a new trade after 5.193 seconds. Maximum observed event latency was 234ms. This is a bounded acceptance test, not a 24/7 uptime guarantee.
- An actual Chrome browser rendered at least three real-source USD quotes and a source chart without runtime errors. Desktop and 320px checks passed. Existing INR account reports and offline app-shell checks still pass; APIs and financial JSON remain outside the service-worker cache.
- The separate public virtual cloud report advanced from run 17 to run 18 at 2026-10-25T04:25:14.697Z (09:55:14 IST). It truthfully records GAP_SKIPPED, 53 skipped intervals and zero new hypothetical fills. No missing interval was backfilled. This is not the Mac's two-account ledger.
- The approved preview branch can read its own fixed-path private GitHub snapshot with the existing server-only read credential. Production continues to read main. Arbitrary refs are rejected before network access; overdue snapshots use no-store.
- Isolated, hash-pinned wheel environment: DuckDB 2.0.0, bt 1.4.1 and skfolio 1.11.0. All 61 installed research dependencies had zero reported known vulnerabilities at this check. Production dependencies and the separately sandboxed repository lab were preserved.
- DuckDB joined all 1,860 recorded fills to source quotes. Independent bt replay matched both flat accounts exactly after separately accounting for Atlas's documented per-execution paise rounding. Original cash, losses, fees and risk latches are unchanged. bt replay audits accounting; it does not independently rederive the trading signals.
- skfolio walk-forward and purged-CV split mechanics pass artificial checks. Actual recorded data has seven daily observations, below the declared 252-row research minimum. Actual walk-forward performance and profitability stay null. CPCV can train after some test periods and is not forward evidence.
- A bounded test-notification path now reserves attempts, limits repeated sends, and distinguishes accepted_by_push_service from device_notification_clicked. Only a valid random receipt carried in the notification can acknowledge its click. Test records are private and separate from real deadline delivery records. Tests are not device-delivery proof.
- The attributed GMP Today historical audit refreshed at 2026-10-25T10:00:30+05:30 with its provider-declared CC BY 4.0 licence and 60 displayed rows. Eighteen fresh selected-publisher RSS headlines were added for four existing issuer records. A fifth issuer RSS request failed parsing and was not fabricated.
- The official IPO deadline snapshot remains stamped 2026-10-22T23:53:58Z. Refreshing news does not refresh issue dates, subscription status, GMP quotes or deadline eligibility. NSE website collection is now explicitly disabled before network access, consistent with the existing source-permission findings.

## Reproduce

```sh
uv venv --python .venv-runtime/bin/python .venv-research
uv pip sync --python .venv-research/bin/python --only-binary :all: --require-hashes requirements/research.lock
PYTHONPATH=src:. .venv-research/bin/python -m unittest tests.unit.test_research_tools -v
PYTHONPATH=src .venv-research/bin/python scripts/research_tools_audit.py
```

The default audit output is private `.atlas-runtime/research-audit.json`. It reads an existing regular SQLite ledger through a read-only transaction; it does not mutate, optimise, restart accounts or fetch market data.

## Remaining external gates

| Item | Verified residual gate |
| --- | --- |
| Free hosted CI | Exact-head hosted GitHub jobs cannot start under the account billing/spending restriction. No budget increase, paid plan or substitute release gate was used. |
| Continuous cloud publication | The preview has a fresh bounded checkpoint; unattended GitHub scheduling and main publication depend on hosted availability and the normal release gate. |
| ScalpStorm historical certification | 0/20 sessions. Authentic permitted minute data, point-in-time eligibility and intended-use evidence remain absent. Null historical results are preserved. |
| Strategy qualification | Existing accounts remain risk halted after losses. Longer authentic holdout/forward evidence and valid NSE inputs are still required. |
| Official IPO/SME dates | A separately permitted fresh source is needed. Existing records remain explicitly old; fresh news or an unofficial audit cannot establish official bid or UPI cutoffs. |
| Device alerts | Safari subscription succeeded and real Atlas test notifications were observed in macOS Notification Centre. Three attempts were accepted by the push service; no matching click receipt is confirmed. The actual Show/click acknowledgement remains pending. Automatic deadline sending stays disabled while source freshness is unresolved. |
| Production release | PR #49 stays a draft. Exact-head hosted green CI and real-source final acceptance are required before main/production. |
| Upstox | Parked until Haji confirms account activation. No token, app, segment or static-IP attempts were made in this batch. |

## Evidence

Private execution receipts are under `.ai/raw`; they include `kraken-soak-summary-20261025.json`, `real-stream-browser-20261025.json`, `research-tools-mechanics-20261025.json`, `research-dependency-audit-20261025.json`, `source-acceptance-20261025.json` and final regression summaries. No secrets, raw private ledger or notification subscription were added to Git.

Useful upstream sources: [Kraken trade protocol](https://docs.kraken.com/exchange/api-reference/spot-websocket-v2/trade), [DuckDB](https://github.com/duckdb/duckdb), [bt](https://github.com/pmorissette/bt), [skfolio](https://github.com/skfolio/skfolio). The other shortlisted engines remain deferred where they duplicate existing capabilities or require missing data, broker access or compute budgets.

## Persistent Mac observation

`com.hajihaz.atlas.public-stream` runs `scripts/run_public_stream.mjs` through the existing user LaunchAgent installer. It reuses the tested public WebSocket adapter and continues independently of an open dashboard. It writes only a private, bounded `.atlas-runtime/public-stream.json` snapshot once per second. Observation time and provider event time remain distinct; stale prices become null. The writer coalesces slow writes, rejects symlink state paths and shuts down cleanly. It never accesses the INR ledger.

The initial reinstall exposed a transient launchd EIO during process cleanup. The absent reporting observer was restored immediately, the installer received a three-attempt EIO-only retry, and artificial failure-injection tests verified the retry bound. A subsequent complete installation succeeded. Live restart checks verify source times continue advancing, the existing recorder remains PID 819, the 1,860 fills and both risk stops remain unchanged, and the saved notification key is preserved.

Notification receipt hardening: the status polling ID cannot acknowledge a test by itself. A separate random proof travels only inside the encrypted push payload; the Mac stores its hash. Receipt updates require the matching proof and expire after ten minutes. Regression checks reject status-ID-only requests, wrong proofs and unknown receipts; neither setup responses nor stored records contain the raw proof. Actual device delivery remains unverified until a real notification click.

## Native device acceptance boundary

After the initial locked-screen attempt, Safari became available. Device subscription succeeded. Three bounded test sends were accepted by the push service, and actual Atlas notifications were observed in macOS Notification Centre, including a saved native screenshot. Native press attempts did not produce a matching click acknowledgement; none was manufactured through the receipt API.

Notification setup now explicitly updates the versioned worker without the HTTP cache and waits for activation. The click handler captures its proof before closing the host notification. A regression emulates the host clearing notification data on close. These checks harden the upgrade/lifecycle boundary; they do not establish the cause of the missing native click receipt. That actual Show/click acceptance step remains open. No additional test sends or automatic deadline alerts are enabled.

## INR recorder recovery

A later real-source check detected stale INR ledger quotes while the web client still received fresh CoinDCX data. A measured Python response took 24.401 seconds. The recorder compared its returned timestamp with the clock captured before the request, so a genuinely recent response could be rejected as future-dated.

The network adapter now validates against response receipt time, and the recorder records the corresponding receipt clock. Provider timestamps and the 90-second age / five-second future limits are unchanged. Delayed-response regressions accept a genuine recent response and still reject truly stale or future timestamps. Ruff, strict typing of 137 modules and 604 Python tests plus 45 subtests passed; four skips remain, including optional-tool checks verified separately.

The paper LaunchAgent was moved to this verified worktree with a controlled restart. The installer command timed out during launchd transition; state was reconciled rather than blindly replayed. The registered recorder recovered as PID 98270 and recorded new native INR quotes at 2026-10-25T05:13:14Z. Both quote ages were nine seconds at acceptance. All 1,860 fills, cash balances, losses and risk latches remained unchanged. No old checkout was edited.
