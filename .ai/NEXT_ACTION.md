# Atlas NPWWMI — Next Unblocked Work

Completed on 26 October 2026:
- Actual SQLite execution-journal crash-window testing.
- Read-only NSE intraday data-quality audit.
- TradingView historical replay code-splitting.
- Transactional DuckDB source provenance receipts and process-crash tests.
- Portable Parquet snapshot + integrity-only provenance sidecar and verifier,
  including no-overwrite, corruption, partial-file and concurrent-import gates.

Next owner-independent tasks, in priority order:
1. Improve offline strategy research outputs with explicit historical quality,
   source-rights and discrepancy-status gates. Never present uncertified data as
   a verified NSE strategy result.
2. Add local-only paper durability/security regression coverage.
3. Improve historical replay accessibility while preserving current behavior.
4. Enable official NSE exchange-session comparison only when a trusted calendar
   and the right to store/use that dataset are actually available.

External gates remain independent: verified Upstox/FYERS NSE API permissions;
rights-cleared point-in-time NSE universe/minute data and trading calendar;
OpenAlgo local key/service; GitHub Actions billing/spending limit.
No live orders, billing changes, production merge or invented performance.
