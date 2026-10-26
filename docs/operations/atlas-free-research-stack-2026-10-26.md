# Atlas Free Research and Paper Integration
Date: 26 October 2026

## Integration record

This changeset adds optional NSE source adapters, immutable local history,
a Backtrader comparison runner, a safe OpenAlgo observer, point-in-time ranking,
and a TradingView Lightweight Charts historical replay. It preserves Atlas's
existing point-in-time native backtester, risk veto, strategy reports, cloud
paper runner and research statistics.

| Integration | New capability | Operational status |
| --- | --- | --- |
| Upstox V3 | strict read-only NSE historical minute candles and observational LTP snapshots | API/token gate |
| FYERS V3 | strict read-only historical candles | app/data entitlement gate |
| DuckDB and Parquet | immutable local OHLCV, ZSTD snapshot export | local tests pass |
| Atlas backtest and Backtrader | independent SMA next-bar comparison | hypothetical only |
| OpenAlgo analyzer | isolated loopback mode observer | local service/key gate |
| TradingView Lightweight Charts | Strategy Lab equity replay slider | frontend build passes |
| NSE PIT top-volume rank | full-universe, timestamps, known-at validation | authentic universe gate |
| Persistent paper runner | existing Atlas process/scheduled jobs | NSE live data gate |
| Analytics and Monte Carlo | existing research tools retained | certification gate |
| ChatGPT and HHC | JSON status, ingest, compare, export, PIT commands | local runnable |

## Strict safety boundaries

This work never enables a brokerage order or remote API mutation.
OpenAlgo's place-order endpoint is **dual use**: it can place real orders when
analyzer mode is switched off. Atlas deliberately does NOT call that endpoint.
Atlas local paper simulation is the only execution authority.

External network operations are restricted to the exact read-only Upstox
historical endpoint, FYERS historical endpoint and local OpenAlgo analyzer
status check. Redirects are denied; generic HTTP errors do not return secrets.
The governance scanner independently enforces the network authority boundary.

Market-data provenance is not the same as full NSE historical certification.
For ScalpStorm X, an authentic, complete point-in-time list of stocks and
time-stamped cumulative volume for every decision is still essential.
Synthetic fixture test returns must never be shown as trading performance.

## Local setup, no software subscription

    uv venv --python 3.11 .venv
    uv pip install --python .venv/bin/python -e '.[dev,integrations]'
    cd frontend && npm ci && cd ..

Secrets must be provided only by an approved environment or secret store.
Never put credentials in Git, terminal arguments, frontend code or logs.

Required environment variable names (values are not stored here):
UPSTOX_ANALYTICS_TOKEN, FYERS_APP_ID, FYERS_ACCESS_TOKEN, OPENALGO_API_KEY.
OPENALGO_LOCAL_URL defaults to explicit 127.0.0.1:5000 loopback.

Use the connected HajiHaz Commander to run these Atlas commands:

    .venv/bin/python scripts/atlas_research_command.py status
    .venv/bin/python scripts/atlas_research_command.py ingest --provider upstox --instrument 'NSE_EQ|INE123456789' --from-date 2026-10-05 --to-date 2026-10-05
    .venv/bin/python scripts/atlas_research_command.py ingest --provider fyers --instrument 'NSE:SBIN-EQ' --from-date 2026-10-05 --to-date 2026-10-05
    .venv/bin/python scripts/atlas_research_command.py backfill --provider upstox --instrument 'NSE_EQ|INE123456789' --from-date 2022-01-03 --to-date 2026-10-26
    .venv/bin/python scripts/atlas_research_command.py compare --provider upstox_v3 --instrument 'NSE_EQ|INE123456789'
    .venv/bin/python scripts/atlas_research_command.py quote --instrument 'NSE_EQ|INE123456789'
    .venv/bin/python scripts/atlas_research_command.py export --output data/snapshots/local-nse.parquet
    .venv/bin/python scripts/atlas_research_command.py pit-rank --input-file /path/to/universe.json
    .venv/bin/python scripts/atlas_research_command.py analyzer-status

Example instrument keys are format examples, not authenticated listings.

Chunk broker historical requests: 28 calendar days maximum for Upstox
minute candles, 100 for FYERS. Each chunk is recorded with SHA-256, and
overlapping conflicting candles are rejected pending explicit review.

The PIT JSON payload must contain a timezone-aware as_of, an authentic
listed_members set, and for every member one row containing symbol,
cumulative_volume, observed_at and known_at. Output says
POINT_IN_TIME_RANKING_ONLY_NOT_EXECUTION_CERTIFIED until authentic source
rights, universe membership and completeness are independently confirmed.

The optional SMA comparison models illustrative commission and slippage.
It does not reproduce a broker-specific NSE statutory fee or tax schedule.
The Upstox REST LTP response has **no exchange trade timestamp**, so Atlas
returns an observational quote with execution_freshness_verified=false;
it cannot trigger either live orders or paper trades.
Live NSE market streaming still needs credentials and an approved persistent
worker. A Vercel static dashboard is not a persistent market feed.

## Verification and blocked externals

Completion requires lint, strict type check, Python safety/regression tests,
frontend build and isolated-paper regression. A passing local mock test does
NOT verify vendor access or certify 20 historic NSE sessions. Live capital is
permanently disabled within this scope. External integrations remain inactive
without explicit permitted provider credentials.

Reference specifications:
- https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/
- https://upstox.com/developer/api-documentation/announcements/analytics-token/
- https://fyers.in/api-docs/v3/api/market-data/historical-data
- https://docs.openalgo.in/new-features/api-analyzer
- https://github.com/tradingview/lightweight-charts


## Automatic historical backfill

The optional backfill command retrieves historical candles over inclusive
calendar-date ranges in provider-approved chunks (Upstox: up to 28 days,
FYERS: up to 100 days), with 1-second pacing between requests.
Archive records preserve hash provenance, and repeat runs remain idempotent.
Failures leave prior validated chunks intact without imputing any gaps.
Backfill output remains **UNCERTIFIED_HISTORICAL_ARCHIVE**.

Example commands (instrument keys are format examples, not guaranteed listings):

    .venv/bin/python scripts/atlas_research_command.py backfill --provider upstox --instrument 'NSE_EQ|INE123456789' --from-date 2022-01-03 --to-date 2026-10-23
    .venv/bin/python scripts/atlas_research_command.py backfill --provider fyers --instrument 'NSE:SBIN-EQ' --from-date 2025-11-01 --to-date 2026-10-23

Network calls require approved account credentials, data entitlements,
vendor terms and historical rights. No data is fetched when those are absent.
