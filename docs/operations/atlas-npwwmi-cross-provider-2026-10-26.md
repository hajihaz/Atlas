# Atlas NPWWMI — read-only historical source reconciliation

Date: 26 October 2026. No NSE API access was used to develop/test this feature.

The command below compares the exact archived source keys, minute interval
and UTC timestamps of two historical provider series. It requires the operator
to provide an explicit symbol mapping, because Upstox and FYERS use different
instrument identifiers and no implicit fuzzy symbol matching is safe.

    .venv/bin/python scripts/atlas_research_command.py compare-sources --provider upstox --instrument 'NSE_EQ|INE123456789' --other-provider fyers --other-instrument 'NSE:RELIANCE-EQ' --archive data/local/nse_history.duckdb

Both keys are format examples; the actual exchange instrument mapping must be
verified from authentic provider instrument records before operational use.

The JSON report provides both observed bar counts, count of common timestamps,
count of bars available on only one side, independently counted price and
volume disagreements, percentage close delta from the primary source, up to
40 concrete discrepancy examples, and per-source original payload-hash counts.

It NEVER chooses a winning vendor, mutates the original archive, constructs
missing OHLCV values, certifies data reuse rights or asserts an authentic full
point-in-time NSE stock universe. No overlap returns an explicit uncertified
alignment status rather than a false agreement. Perfect within-sample
agreement is also explicitly UNCERTIFIED.

Six synthetic offline contract tests check perfect overlap, price/volume
conflicts, asymmetric missing minutes, zero timestamp intersection, source
mapping rejection and the read-only CLI contract. All providers remain
blocked operationally until read-only credentials, exchange permission and
historical-rights evidence are supplied.
