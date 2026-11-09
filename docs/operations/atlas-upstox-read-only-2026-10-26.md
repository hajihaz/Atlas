# Atlas Upstox read-only recovery — 26 October 2026

Upstox account activation and existing signed-in Developer Apps access allowed creation of the previously absent Analytics Token. Successful authenticated GET quotes/history are verified. The token stays in a private0600 credential file outside Git and is loaded only through an explicit option. Existing paper records and production are preserved.

## Delivered

- A transparent Atlas application User-Agent fixed the observed default-urllib Cloudflare rejection. TLS, pinned hosts/paths and redirect refusal remain enforced.
- Private NIFTY50 and RELIANCE history:7500 one-minute bars each,18Sep–16Oct2026. Both match all375 minutes of each20-date existing campaign grid; four transactional provenance batches. Parquet export and integrity verification passed.
- Existing fixed Backtrader SMA9/21 replay ran on7500 Reliance bars, with100000 INR virtual cash,0.1% commission and0.05% slippage assumptions.409 hypothetical orders. This is an integration smoke with overnight positions permitted; it is not ScalpStorm or qualified performance. Detailed results stay on the owner Mac.
- New isolated local observer batches two full quotes:one poll/second only during NORMAL_OPEN,one/minute after hours; market status cached60seconds. Actual exchange trade time, provider quote time and local receive time remain distinct.401/403 stop;429 honors Retry-After, including non-JSON error responses.
- Private Market Watch at http://127.0.0.1:4310/#markets. NIFTY uses index points, RELIANCE uses rupees. Snapshots expire after90seconds; malformed identities/authority flags fail closed. Loopback Host, exact Origin, nonsymlink/private-file checks and field projection protect the endpoint.
- New nse-observer and nse-owner-ui LaunchAgents run beside the original five unchanged services. The new UI rejects writes and disables notification registration. All seven were running; original4300 UI remained HTTP200. Genuine in-session behavior remains to be observed.
- No bearer credentials or broker data are sent to Vercel/GitHub. The cloud NSE endpoint returns404. Real and paper orders are disabled in this observer.

## Verification

Functional code:c0920d248b6aebbba17eb9d99d2bce63061cbe23.756 Python tests and85 subtests passed,zero skips, using a disposable UTF-8 PostgreSQL and preserved LEAN fixtures.482 JavaScript tests across74 files passed. Ruff,strict mypy155 source files,TypeScript and production build passed. Actual owner-local desktop/mobile/navigation checks passed with zero uploads or order requests.

Protected code preview READY: https://atlas-control-center-zs3d8yuxy-kuddosahib-8503s-projects.vercel.app .
Root and Strategy Lab HTTP200; Strategy Lab719 public crypto bars/five hypothetical strategies, no executed orders. Local and deployed main bundle SHA256:
3d6724eae4f89dd68dcdd2bc20a5dc9a52c7dd962f458e2da3b66da6af49455b.

Three hosted workflows failed with zero executed steps. Included GitHub Actions minutes were previously verified exhausted; recorded reset1Nov2026. No retry loops,billing changes or gate bypass. Production remains56a40956e4ecc64b86ddf3c6bd86dbd872d9b909; original publisher approval remainsd1a49144c28c8a5f2908de5307b03c39972e3771.

## Progress and remaining acceptance

The existing integration rubric advances71→76/100:+3 verified Upstox access,+2 actual target-window archive/export. No other weights change. This is the10-component integration score,not the older overall Atlas84% estimate.

ScalpStorm remains0/20 certified. Two instrument histories do not establish the complete historical stock universe, contemporaneous top-volume rankings, corporate-action treatment, source rights or exchange-timing completeness. Existing archive provenance intentionally cannot self-attest those external facts. Successful authenticated API access is separate evidence.

Remaining:complete authentic PIT NSE stock universe/history; genuine cost/holdout/forward strategy qualification and NSE paper validation; FYERS credentials; genuine authenticated OpenAlgo service/session; exact-head hosted CI and normal production acceptance. No new subscription cost or real-money exposure.
