# Atlas NPWWMI: auditable local history receipts

Date: 26 October 2026. Scope: read-only / offline NSE research.

## What changed

Each historical batch admitted to the local DuckDB archive now creates a
receipt **in the same transaction** as its validated candles. Receipts record
the provider label, exact instrument, interval, requested inclusive date window,
original provider payload SHA-256, number of received candles and first local
ingestion time. They also carry a deterministic metadata checksum for local
corruption detection. Retrying the same batch does not rewrite the first
ingestion timestamp or create another receipt.

An interrupted process after candle insertion or after receipt insertion rolls
back both. A crash after commit retains both; a repeat import is idempotent.
Tests terminate only dedicated subprocesses using disposable DuckDB files.

## Explicit limits

Every receipt and report permanently uses unverified status for:
- market-data redistribution/storage entitlement or license,
- provider authentication provenance and authenticity,
- source exchange observation/publication time,
- full point-in-time NSE universe coverage.

Local ingestion time is NOT the time at which an exchange observation was
published or became publicly available. A SHA-256 digest detects accidental
local modification but is NOT a vendor signature or licensing authorization.
The schema is additive; historical rows created before this receipt mechanism
remain visible as legacy/unattributed, not retroactively certified.

## Inspect the archive from ChatGPT via HHC

    .venv/bin/python scripts/atlas_research_command.py provenance --provider upstox --instrument 'NSE_EQ|INE123456789' --archive data/local/nse_history.duckdb
    .venv/bin/python scripts/atlas_research_command.py provenance --provider fyers --instrument 'NSE:SBIN-EQ' --archive data/local/nse_history.duckdb

The JSON report contains receipt_count, observed_candles,
legacy_unattributed_candles, source_rights_verified=false,
point_in_time_universe_verified=false, and receipt details.
Missing local archives fail closed. No external API account or payment is needed
to test this feature against synthetic candles.

## Acceptance evidence

- 598 Python passed, 7 skipped (isolated PostgreSQL / missing LEAN fixtures).
- 316 frontend/script/research JavaScript tests passed.
- Ruff, strict mypy (138 Python source files), TypeScript and Vite build passed.
- Ten new tests cover receipt idempotence, rollback-on-conflict, tampered
  metadata detection, legacy row visibility, source scope, CLI redaction and
  three real process-termination windows.
- Hosted GitHub Actions certification remains blocked by the account-level
  payment/spending-limit gate. No billing configuration was changed.
- Atlas main/production and live capital are untouched.
