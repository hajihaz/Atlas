# Atlas owner runtime — 24 October 2026

This delivery builds on the consolidated research and QA candidates (#47 and #48).
It provides a private Mac dashboard, independently reconciled forward-paper reports,
a supervised reporting observer, risk pauses, source-only charts, background-push
plumbing and a restricted local MCP server. It does not certify profitability,
stock history, one-second streaming, phone delivery or hosted release.

## The eight goals

| Confirmed goal | Delivered in this candidate | Remaining acceptance |
| --- | --- | --- |
| Live market command center | Lightweight Charts renders actual source candles and timestamped events. Existing read-only REST fallback remains. CCXT retrieved a native BTC/USD public observation. | Browser socket negotiations failed for both Engine.IO versions from a legitimate loopback origin. Approved, authenticated NSE access is absent. |
| Authentic backtesting without look-ahead | Existing source-bound engine and historical certification gates preserved; all local regressions pass. | Authentic, licensed, point-in-time NSE bundle is still missing: 0/20 sessions certified. No invented returns. |
| Automatic paper trading | Existing 20-second recorder preserved; new supervised observer reconciles it and enforces the configured drawdown halt. | Current comparison strategies are risk halted. A justified replacement needs valid historical and forward evidence. CoinDCX returned stale source timestamps at the final observation, so continuous fresh market data is not accepted. Mac services require an awake, online Mac; no 24/7 availability guarantee. |
| Clear capital, trades, P/L, fees and drawdown | Independent account balances, realized/unrealized P/L, recorded fees, daily drilldowns, monthly recorded-day totals and observed drawdown. | Cloud/private-ledger synchronization needs a narrowly scoped server-only credential. Full exchange costs, liquidity and impact are not certified. |
| Dependable strategy selection | QuantStats cross-checks observed day-end drawdown. Optuna is installed for later bounded research. | The observed strategies lost virtual capital. No strategy is certified profitable; optimization is not activated on missing or invalid data. Time and new out-of-sample evidence cannot be manufactured. |
| IPO intelligence | Existing research UI plus permission-based Web Push subscription, source freshness checks and idempotent delivery reservations. | Source access/intended-use approval, a fresh permitted feed, device permission and a confirmed delivery are still required. Sender remains disabled. No IPO applications are placed. |
| Atlas + ChatGPT control | Official MCP stdio server tested end to end: read account/day records and idempotently pause/resume existing paper accounts; risk latch vetoes resume. | ChatGPT does not consume local stdio directly. Registration of a suitably authenticated remote connector remains an owner/account integration gate. No public listener or tunnel was created. |
| ₹0 operation and capital protection | No additional subscription or infrastructure spend; all orders remain simulated, actual capital ₹0. Existing source fills retained; drawdown breaches halt new signals. | Hosted GitHub jobs cannot start because of the reported account billing/spending restriction. Main and production remain gated by exact-head hosted checks. Real-money use needs separate explicit approval. |

## Installed upstream projects

Only the useful official packages were installed; no full trading-bot framework was
copied into Atlas. The lockfiles contain exact resolved releases and Python hashes.

| Repository | Installed release | Role |
| --- | --- | --- |
| [TradingView/lightweight-charts](https://github.com/tradingview/lightweight-charts) | 5.2.1 | Source candles/event charts; license and NOTICE retained with attribution. |
| [web-push-libs/web-push](https://github.com/web-push-libs/web-push) | 3.6.7 | Encrypted push delivery; sender off pending acceptance. |
| [upstox/upstox-python](https://github.com/upstox/upstox-python) | 2.30.0 | Official SDK, constrained GET-only data adapter. No token configured. |
| [ccxt/ccxt](https://github.com/ccxt/ccxt) | 4.5.90 | Public Kraken last-trade reference, native USD preserved. |
| [ranaroussi/quantstats](https://github.com/ranaroussi/quantstats) | 0.0.86 | Recorded day-end drawdown cross-check. |
| [optuna/optuna](https://github.com/optuna/optuna) | 5.0.0 | Available for later approved research; no optimization run claimed. |
| [agronholm/apscheduler](https://github.com/agronholm/apscheduler) | 3.11.3 | Supervised reporting schedule. |
| [modelcontextprotocol/python-sdk](https://github.com/modelcontextprotocol/python-sdk) | 1.30.0 | Restricted owner-local stdio MCP. |

The pre-existing [QuantConnect/Lean](https://github.com/QuantConnect/Lean) research
setup was retained. One regression requires missing LEAN sample data and remains
explicitly skipped. Package licenses do not grant market-data rights. Full
copyleft trading stacks and unverified hosted-data services were not necessary
for this implementation.

## Paper evidence and safety action

The source database is the owner's existing `~/.atlas/live-paper.sqlite3`.
Each modeled fill is reconciled against its recorded quote, side, cash, units and
fee before a result is shown. The source runtime holds independent ₹100,000
comparison accounts; these balances must never be added.

At the risk-enforcement checkpoint, BTC had 750 modeled fills and realized P/L
−₹25,475.06, including ₹7,474.51 recorded fees; ETH had 1,110 modeled fills and
realized P/L −₹37,286.91, including ₹11,062.67 recorded fees. Both were flat.
Observed drawdowns exceeded the existing 25% RiskGate threshold. Both accounts
were paused and durably risk latched. Fill count remained 1,860 before and after.
No liquidation, order or retrospective fill was created.

Observed drawdown uses the recorded quote path, not all exchange ticks. Monthly
totals cover recorded days; they are not certified complete calendar returns.
Stale open positions do not acquire invented valuations.

## Run and recovery

The installed user agents are `com.hajihaz.atlas.owner-ui` and
`com.hajihaz.atlas.owner-observer`. The private dashboard is
`http://127.0.0.1:4300` on the Mac. It is not a public or phone-accessible cloud
endpoint. The existing `com.hajihaz.atlas.paper` recorder stays separate.

Rebuild with Node 24 using `npm run build --prefix frontend`. Install the isolated
runtime with `uv pip install --python .venv-runtime/bin/python --require-hashes
-r requirements/runtime.lock`, with repository `src` on PYTHONPATH.
`scripts/install_owner_runtime.py` prints its fixed LaunchAgent definitions by
default; `--install` installs them. It refuses to replace a service owned by a
different checkout. Inspect `.atlas-runtime/observer-status.json` for freshness.
The health record distinguishes verified accounting from stale source data. Private reports, push keys and device subscriptions remain outside Git.

For an OS-authenticated stdio MCP client, invoke the isolated Python with
`-m atlas.runtime.mcp_server` and the repository `src` in PYTHONPATH.
Read-only is the default. `ATLAS_ALLOW_PAPER_CONTROL=1` permits only existing
paper-account pause/resume; it cannot override the risk latch. No broker tools
or arbitrary file paths are exposed. A test client is available in
`scripts/verify_owner_mcp.py` using an artificial disposable ledger.

The service worker caches only the app shell and hashed assets. It never caches
financial JSON or API responses. Notification setup requires an owner-local
pairing nonce and browser permission. Push endpoints are restricted to reviewed
HTTPS vendors. Provider acceptance is not device-delivery confirmation. Delivery
reservations persist before network calls; ambiguous failures are not blindly
retried.

## Verification and release

The [machine-readable receipt](atlas-owner-runtime-2026-10-24.json) records final local test and
service evidence. Full raw logs remain local. Checks include 424 Node tests,
595 Python tests with disposable UTF-8 PostgreSQL, strict typing of 136 modules,
Ruff, source secret scanning, package auditing, official MCP transport, real
account UI/day drilldowns, phone width, offline shell and financial-cache
exclusion. The 40-state accessibility audit is bounded automated evidence, not
a full WCAG certification.

CI installs the hash-pinned optional runtime and runs the added adapter/MCP
checks. Deliver this combined candidate in one review PR; do not independently
merge superseded candidates. No main merge or production deployment may occur
without green hosted checks on the exact release head.

The remaining execution order is: restore zero-cost hosted-job availability;
create the narrow private-ledger read credential in a trusted owner flow;
configure approved read-only NSE/IPO access and collect authentic data; confirm
a real device alert; register the authenticated ChatGPT connector; accumulate
forward evidence and complete exact-head release acceptance. Credentials and
2FA stay in their native trusted UI, never in chat.
