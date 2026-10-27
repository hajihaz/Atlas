# Atlas NPWWMI: portable Parquet integrity manifest

26 October 2026. Owner-independent work on Atlas research integration branch.

The CLI's existing read-only Parquet export now produces TWO files:
a local Parquet snapshot and a same-named .manifest.json sidecar. The output
reports a local SHA-256, file length, observed number of candles, and a record
of the stored per-batch provenance receipts. Use the sidecar to identify the
source/provider/date ranges and to detect accidental file corruption.

    .venv/bin/python scripts/atlas_research_command.py export --archive data/local/nse_history.duckdb --output data/snapshots/nse-local.parquet
    .venv/bin/python scripts/atlas_research_command.py verify-export --output data/snapshots/nse-local.parquet

Outputs are no-clobber: existing Parquet or manifest files are refused. Staged
temporary files are removed on success or handled failure; a simulated
filesystem publication error does not leave a new published Parquet behind.
Verification rejects absent/mismatched pairs, truncated files, changed bytes,
unsafe manifest labels and unsupported manifest versions.

Concurrent imports are checked around the snapshot export. If the DuckDB row
count or source receipt inventory changes while creating the file, the output
is refused and cleaned up. For consistent results, pause ingestion during
export. Two filesystem paths cannot be published atomically as a pair across
all crash scenarios; therefore EVERY downstream consumer must run the verifier
before reading a copied/exported Parquet dataset. No provider feed is required
to run the offline tests with synthetic samples.

IMPORTANT: SHA-256 only establishes equality with the unsigned local manifest.
It is not a vendor digital signature, data license, exchange timing witness,
NSE trading-day calendar, point-in-time universe, nor execution-quality proof.
The status remains LOCAL_FILE_INTEGRITY_ONLY_NOT_NSE_CERTIFIED; receipt rights
remain UNVERIFIED. Historical backtests must keep these warnings visible.

Local verification after this work: 607 Python tests passed with 7 skips for
missing isolated PostgreSQL/LEAN sources; 316 JavaScript tests passed; Ruff,
strict mypy, frontend TypeScript and Vite build passed. GitHub-hosted CI
requires a separate owner action on the account's billing/spending-limit gate.
No live orders, paid subscriptions, production changes or main merge.
