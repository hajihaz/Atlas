# Atlas NPWWMI — crash-window recovery and historical data quality

Date: 26 October 2026. Branch: haor/atlas-free-research-stack-20261026.

## Safety hardening

Added synthetic subprocess fault injection into the actual
TransactionalExecutionJournal.apply_broker_fill code path:
- process termination after SQLite INSERT but before COMMIT,
- termination immediately before COMMIT,
- termination after COMMIT before in-memory account and ledger changes,
- successful second journal fill after recovery from post-commit death.

Each test uses a disposable pytest SQLite file and a durable checkpoint marker.
Recovery must discard uncommitted events and preserve committed fills precisely
once; replay must not deduct cash twice. No production database, credentials,
broker requests or capital were touched.

## Historical candle quality diagnostics

Added a read-only audit of the DuckDB archive with source count and minute
coverage: missing bars **between observed timestamps on the same IST date**,
off-hours/irregular timestamp warnings, number of observed dates and historical
payload hashes. The CLI reports no trusted market/trading-day calendar and never
claims a complete NSE historical series merely because bars are contiguous.

Usage:

    .venv/bin/python scripts/atlas_research_command.py audit-history --provider upstox --instrument 'NSE_EQ|INE123456789' --archive data/local/nse_history.duckdb
    .venv/bin/python scripts/atlas_research_command.py audit-history --provider fyers --instrument 'NSE:SBIN-EQ' --archive data/local/nse_history.duckdb

Date ranges without bars and absent trading sessions cannot be distinguished
without exchange-calendar evidence. Exchange special sessions may trigger
off-hours warnings. Authentic vendor source rights and universe certification
remain external gates, not satisfied by this quality audit.

## Local verification

- 588 Python tests passed, 7 skipped (isolated PostgreSQL and missing LEAN data).
- 314 JavaScript tests passed.
- Ruff, strict mypy (138 source files), frontend TypeScript and Vite build passed.
- No GitHub Actions certification yet; account billing/spending limit blocks
  hosted runners before any steps execute.
- No live capital, real brokerage orders, API subscriptions, or production merge.
