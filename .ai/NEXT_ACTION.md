# Atlas NPWWMI — Next Unblocked Work

Completed on 26 October 2026:
- Actual SQLite execution-journal crash-window testing.
- Read-only NSE intraday data-quality audit.
- TradingView historical replay code-splitting.
- Transactional DuckDB source provenance receipts and process-crash tests.
- Portable Parquet snapshot + integrity-only provenance sidecar and verifier,
  including no-overwrite, corruption, partial-file and concurrent-import gates.

Next owner-independent tasks, in priority order:
1. Review and expand read-only source conflicts with a deterministic comparison
   report; never auto-rewrite immutable historical bars.
2. Improve offline strategy audit/report use of quality/provenance warnings.
3. Add more local-only paper durability and security regression coverage.
4. Improve research UI accessibility and bundle weight without behavior changes.

External gates remain independent: verified Upstox/FYERS NSE API permissions;
rights-cleared point-in-time NSE universe/minute data and trading calendar;
OpenAlgo local key/service; GitHub Actions billing/spending limit.
No live orders, billing changes, production merge or invented performance.
