# Evidence and methodology contracts

The runtime validators are in `research/nse-certification/normalize.mjs` and
`certify.mjs`. The JSON Schema describes the manifest and independent review
envelopes; runtime checks additionally enforce file hashes, paths, temporal
relationships, identity joins, exact grids and cross-file agreement.

## Bundle

`atlas.nse-bundle.v1` contains `kind`, `producer`, `files`, and `sessions`.
`kind` is `HISTORICAL_MARKET` or `SYNTHETIC_FIXTURE`. Every file must have the same
kind. A file entry has a unique `id` and relative `path`, exact `sha256`, `role`,
`sourceId`, HTTPS `sourceUrl`, explicit-zone `retrievedAt`, and `publishedAt`
where historical publication evidence is needed. Symlink/path escape, duplicate
IDs/paths, mixed kinds, invalid JSON keys and corrupt hashes are rejected.

Roles are `ORIGINAL`, `CANDLES`, `UNIVERSE`, `MASTER`, `ELIGIBILITY`,
`SUSPENSIONS`, `IDENTITY`, `ACTIONS`, `PUBLICATION`, and `RIGHTS`.
Original artifacts are retained separately from normalized enumerations.

Each session entry names `session`, `universeFileId`, all `candleFileIds`,
`indexFileId`, `actionsFileId`, `publicationFileId`, and `rightsFileIds`.
The scoped calendar has exactly twenty regular cash sessions; 2 October is
excluded. Other dates and duplicate sessions are rejected.

## Candle normalization

| Format | Actual source representation | Important constraints |
|---|---|---|
| `UPSTOX_V3` | `status:success`, `data.candles`, seven-element arrays | Explicit-zone candle-start timestamp; API errors rejected; descending rows sorted before validation |
| `FYERS_V3` | `s:ok`, `candles`, six/seven-element arrays | Explicit epoch seconds; millisecond values rejected |
| `ATLAS_CSV` | `symbol,timestamp,open,high,low,close,volume` | Exact header and one symbol per file; explicit timezone; decimal numeric strings only |
| `NORMALIZED_V1` | `schema:atlas.nse-candles.v1`, `kind`, `instrumentId`, `session`, `rows` | Identity, session and kind must match the file entry; each row has ISO-zone `time` and numeric OHLCV |

Each candle entry declares `instrumentId`, `session`, `format`, `volumeUnit`
(`SHARES`, or `INDEX` only for the NIFTY index) and `priceBasis`.
Only `RAW_UNADJUSTED` can pass certification. Recognized but rejected bases are
`BACK_ADJUSTED` and `UNKNOWN`. No inverse adjustment is guessed from current data.
Minute starts must be aligned and inside 09:15–15:29 IST. Prices must be positive,
finite and OHLC-consistent. Share volume must be a nonnegative safe integer.
Duplicate minutes, negative/fractional volume and coerced JSON strings fail.
There is no interpolation, forward fill, zero fill or silent `:59` rounding.

`normalizeUpstoxMaster` accepts raw/gzipped JSON with full MIS IDs, suspended IDs
and an independently dated NSE ISIN-to-series map. It joins stable ISIN keys,
requires ordinary EQ whole-share instruments and an explicit, source-verified
tick-size unit (`PAISE` or `INR`). A present-day BOD publication cannot be relabelled as a pre-open
historical snapshot. This helper does not certify membership or a source's rights.

## Full point-in-time membership

The universe schema is `atlas.nse-universe.v1`, with the session, `exchange:NSE`,
`segment:CASH`, `scope:FULL_NSE_CASH_INTRADAY_ELIGIBLE_STOCKS`,
`selection:PREOPEN_FULL_ELIGIBLE_UNIVERSE`, pre-open `knownAt`, `effectiveAt`,
`members` and separate evidence IDs for master, eligibility, suspensions and identity.

Members contain `id:NSE_EQ|ISIN`, `isin`, historical `symbol`, `series:EQ`,
`lotSize:1`, `priceTickINR`, `knownAt`, `effectiveFrom`, `effectiveTo` and
`shortEligible`. This implementation's supported scope is ordinary EQ cash
stocks eligible for the declared provider's intraday product. It excludes
unresolved security types. The exact provider/filter scope must be documented
and independently reviewed before claiming complete NSE eligibility or Groww fidelity.

Each reference evidence file uses `atlas.nse-reference-evidence.v1`, the same
session/scope, all `instrumentIds` and `originalFileId`. All four sources must
have been published before 09:15, with membership known/effective at selection.
The eligibility enumeration minus suspensions must equal the entire candidate
set. A current list, yesterday's traded-symbol bhavcopy or a post-hoc top ten
cannot establish this evidence. Full-universe claims remain a source-review
responsibility even after set-consistency checks pass.

## Actions and publication

`atlas.nse-actions.v1` includes `session`, `priceBasis:RAW_UNADJUSTED`,
`reviewedFrom`, `reviewedThrough`, every stock and the NIFTY in `instruments`,
`events`, and an original evidence file. Events name `instrumentId`, `type`,
`effectiveAt`, and `knownAt`. Split, bonus, dividend, rename and delisting are
recognized; unresolved intraday actions, future-known actions and incomplete
review coverage fail. Reconstructing original prices or histories of merged
identities requires a separately verified source; this tool never invents them.

`atlas.nse-publication.v1` uses `mode:RECORDED_OBSERVATION` and an observation
for every imported candle. Each observation names `instrumentId`, `minute`,
`availableAt`, `observedAt`, `candleHash` and `evidenceFileId`.
The canonical candle hash covers normalized epoch-ms time and all OHLCV values.

Evidence can be one `atlas.nse-observation-receipt.v1` record or a bounded
`atlas.nse-observation-receipts.v1` batch with `observations`. Each proof repeats
the candle/timestamps and points to `originalFileId` plus `originalSha256`.
Batching avoids one physical file per stock-minute. Hash-linked records may be
collected in append-only logs, but the independent review must establish their
timestamp authority, immutability and original payload correspondence. Self-written
timestamp strings do not establish historical publication.

Receipt/publication timestamps accept fractional seconds and round upward to
the engine's millisecond resolution. A sub-millisecond observation after a
cutoff cannot be moved before it. Candle starts require exact zero seconds and
zero fractional seconds; end labels cannot round into an accepted minute.

Opening bars must have closed, been available and been observed by 09:30.
The cutoff is literal 09:30:00 IST; even a complete opening window received
later fails this frozen rule. There is no automatic latency allowance.
Retrospective history alone establishes none of those historical availability
claims. Later bars retain their recorded availability for execution/liquidity
checks. The certifier retains summaries per day and reopens one day at a time
for replay; full-universe 20-session market data still needs an adequately sized
offline machine and private disk.

## Independent review and replay

The external `atlas.nse-independent-review.v1` is pinned by SHA-256 and bound to
the exact manifest. It records a distinct reviewer, review time, approved
session scope and `VERIFIED` decisions for authenticity, the full PIT universe,
raw prices/share volumes, identity/actions, recorded publication, private use
and derived-result publication. Source-specific grants point to actual rights
evidence, declare zero additional cost, effective permission dates, data date
coverage, private research and derived-result publication rights. Raw
redistribution is a separate explicit boolean and is never required or performed.

Technical consistency and independent source review are separate gates.
Synthetic kinds always certify zero real sessions. Rights must cover every source;
one broker's permission does not license an unrelated GitHub archive.

The independently implemented ranking sums exactly 09:15 through 09:29 share
volume for every eligible member, then sorts descending, with ASCII symbol
ties. It checks overflow and input-order invariance. A separate test compares
the result with an imperative oracle and the unchanged `research/advanced`
implementation. Financial simulation is gated on all twenty certified source
sessions. Its frozen research assumptions are emitted by `replay.mjs`: ten
₹10,000 whole-share slots, ₹100,000 daily reset, 09:40 entry, 15:00 scheduled exit,
5 bps adverse slippage, illustrative 10 bps fees each side, 2% stops, prior-minute
5% participation and a 10% slot drawdown halt. Short replay additionally requires
reviewed eligibility. These are hypothetical bar fills and illustrative costs.

The ±0.15% NIFTY direction rule remains the existing Atlas research assumption.
Groww's exact UI ranking/filter semantics and executed fill fidelity are unverified.
Daily realized and unrealized P&L are separate; unliquidated positions keep net
realized campaign results incomplete. Monthly sums require all dates in that
month and complete simulation; campaign totals require all twenty. Recurrence
uses stable identities while preserving observed symbols. No result is written
to the cloud-paper ledger.
