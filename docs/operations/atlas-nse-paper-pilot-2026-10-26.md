# Upstox-only NSE paper pilot — 26 October 2026

Atlas has a private Mac workspace at http://127.0.0.1:4310/#nse-paper. It uses the existing Upstox Analytics credential for market data and models virtual orders locally. FYERS and OpenAlgo are optional future integrations.

## Scope and operation

Ten current NSE equity identities form a fixed pilot basket. Five existing strategies each have a separate ₹1,00,000 comparison account, allocated at most ₹10,000 per stock. Accounts are independent and must not be summed as one portfolio. Only whole shares and available cash are allowed. There is no leverage, short selling, broker-order endpoint, or live-capital authority.

A single read-only collector supplies both the existing quote panel and the paper worker. It requests quotes every two seconds during NORMAL_OPEN, current-day minute candles approximately once per minute, and closed-market quotes once per minute. Exchange status is refreshed approximately once per minute. Network failures use bounded backoff; authentication or identity changes stop the collector for review.

The worker reads private files and maintains an atomic SQLite event journal. Fills require a subsequent genuine source trade after the recorded signal, acceptable quote age, bid/ask evidence and sufficient displayed quantity. Repeated or stale trades cannot fill. Stops, session exits, daily-loss limits and a peak drawdown limit restrict new entries. Unresolved positions remain recorded if an exit cannot fill. Illustrative costs are 10 basis points plus 5 basis points of slippage per side; actual broker fees and executions remain unverified.

## Historical results

The existing frozen strategy defaults were replayed against 75,000 authentic source minute candles: ten stocks, twenty sessions, 375 minutes per session, 18 September–16 October 2026. The basket was selected using current identities; authentic past market-wide membership, corporate-action treatment and source redistribution rights are not certified.

Historical executions assume a following-minute opening price, a spread proxy and liquidity derived only from a previous completed minute. They are hypothetical and never seed the forward ledger. All five strategies lost money and reached risk halts under these assumptions. The private historical journal and all 100 strategy/day reports preserve those losses and zero-fill days. There are still zero certified sessions of the original market-wide ScalpStorm campaign.

An independent integer-accounting audit reconciled all 1,574 historical modeled fills and 362,029 journal events. Causality, missing data, corruption, duplicate observations, process-crash boundaries, private file handling and report validation have explicit automated checks.

## Owner access and privacy

The owner API is loopback-only, GET-only and guarded against foreign origins, traversal, unsafe file permissions and symlinks. The same verified accounting is available through:

```sh
/opt/homebrew/opt/node@24/bin/node scripts/nse_paper_report.mjs .atlas-runtime/nse-paper.sqlite3
/opt/homebrew/opt/node@24/bin/node scripts/nse_paper_report.mjs .atlas-runtime/nse-paper.sqlite3 sma_9_21 2026-10-27 0
```

Run these from the Atlas consolidated worktree. Credentials, source payloads, financial journals and detailed owner reports remain private on the Mac. They are excluded from Git and the cloud deployment. The cloud NSE accounting API must return 404.

The original crypto ledgers, their losses, and five original LaunchAgents are preserved. Only the two isolated NSE services are updated, with a third NSE paper-worker service added. No notifications are resent.

## Acceptance and remaining gates

Local regression: 766 Python tests plus 85 subtests, 519 JavaScript tests, no skips; Ruff, strict mypy, TypeScript and the frontend build pass. Real-source browser checks cover five strategies, filled and zero-fill days, desktop/mobile, dark theme and mode switching; all 100 daily API pages pass.

Service promotion, exact-commit preview verification and the final receipt are recorded in the machine-readable Atlas handoff after execution. The market is closed during installation. Genuine open-session forward observation remains required and cannot be substituted with replay. This is an unqualified paper pilot, not evidence of profitability.

Required GitHub-hosted CI is a separate production-release gate. The recorded included-minutes reset is 1 November 2026; production/main and draft PR #52 remain protected by normal release acceptance. The prior broader ten-component integration score is retained separately from the pilot-readiness score.
