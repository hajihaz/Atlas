# Next Pending Atlas Work Without Owner Input

Completed 26 October 2026: disposable SQLite INSERT/COMMIT crash-window tests,
exactly-once recovery tests, and a conservative read-only NSE history quality
audit CLI. See docs/operations/atlas-npwwmi-crash-history-2026-10-26.md.

Next unblocked work:
1. Enhance market-history source provenance and rights tracking without inventing permissions.
2. Add exchange-session/holiday coverage checks only after a verified session calendar is available.
3. Expand local-only paper durability/security regressions.
4. Continue historical replay accessibility and source-backed quality panels (initial TradingView bundle code-splitting completed and tested).

External gates are separate: broker read-only credentials/entitlements, authentic
rights-cleared NSE point-in-time universe/minute data, OpenAlgo local service,
and GitHub Actions account billing. No paid changes, live trading or main
release should occur without independently passing required approvals.
