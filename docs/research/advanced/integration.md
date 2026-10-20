# Handoff to the cloud-runtime session

Import from research/advanced/index.mjs in an offline job/server layer.
Only Node.js standard libraries are required. Do not import upstream-audit.mjs
or isolated-upstream-check.py into production. Shared production files are
unchanged.

## Market input

An atlas.market.v1 object has:

| Field | Required content |
| --- | --- |
| instrument | id, assetClass (CRYPTO/NSE_EQUITY/NSE_INDEX), venue, INR currency, lotSize, priceTick |
| intervalMs | Explicit bar interval in milliseconds |
| provenance | kind, provider, sourceUrl, retrievedAt, rawSha256, researchUseAllowed, displayToThirdPartiesAllowed, licenseRef, availabilityMode |
| candles | time, availableAt, open, high, low, close, volume |
| expectedTimes | Exact declared grid, required for NSE |
| corporateActions | reviewed, reviewedThrough, sourceUrl, actions; required for NSE |

Kinds are HISTORICAL_MARKET or SYNTHETIC_FIXTURE. Historical source candles are
not executed trades. Observed quotes have a separate atlas.quote.v1 schema and
OBSERVED_MARKET_QUOTE kind. Fills are HYPOTHETICAL_BAR_FILL.

Use epoch milliseconds or ISO timestamps with an explicit offset. Numeric
strings and ambiguous local times are rejected. Availability mode is
RECORDED_PUBLICATION or explicitly ASSUMED_BAR_CLOSE.

Detach the source manifest from exact raw JSON candle bytes:

~~~sh
node research/advanced/cli.mjs replay \
  --manifest /private/authorized/manifest.json \
  --candles /private/authorized/candles.json \
  --output /private/authorized/new-research-output.json
~~~

ingestCandleJson validates the actual raw-byte SHA-256 before normalization.
CoinDCX manifests use providerFormat COINDCX. Its adapter normalizes descending
order, rejects duplicates/gaps and labels publication assumed at close.
It does not establish archived revision/vintage authenticity.

## Research API and dashboard

~~~js
import { importDataset, simulate, createResearchEnvelope } from './research/advanced/index.mjs';
const dataset = importDataset(authorizedInput);
const result = simulate({ dataset, strategyId: 'sma_9_21' });
const report = createResearchEnvelope({ dataset, results: [result] });
~~~

Supplied results are replayed to reject invented performance, even when a
forged result has a recomputed checksum. External source authenticity still
requires independent review.

| Advanced field | Dashboard use |
| --- | --- |
| strategies[].id, name, version, parameters | Five strategy names and reproducible rule details |
| capitalINR, endingEquityINR, modeledReturnPct | Hypothetical capital/equity/return |
| modeledNetPnlINR, realizedPnlINR | Marked total versus closed realized result |
| trades, equity, riskEvents | Trade details, chart and risk audit |
| dataHash, strategyHash, resultHash | Source/rule/result binding |
| fixtureOnly, mode, label | Mandatory evidence classification displayed with results |

The envelope schema is atlas.advanced-research.v1, distinct from the existing
strategy-lab schema. Do not overwrite cloud paper JSON with it.
paperLedgerImportAllowed, paperOrdersExecuted, paperLedgerStored and
liveOrdersEnabled are false. Node crypto belongs in the job/server layer,
not a direct browser bundle.

THIRD_PARTY audience requires explicit source display permission. The fixture
dashboard envelope is a labeled software example and cannot be paper history.

## ScalpStorm and council

runScalpStormDay takes session, a complete atlas.universe.v1 snapshot, one dataset
per eligible stock, indexDataset (canonical ID NIFTY50), optional configuration,
and explicit short enablement if needed. Universe members have id, availableAt,
effectiveFrom, optional effectiveTo and shortEligible. The snapshot has knownAt,
completeEligibleUniverse and provenance.

runScalpStormCampaign({days}) returns atlas.scalpstorm-campaign.v1. Use days[]
for date drill-down; daily[] for totals; recurringStocks separates selection
count from traded-session count. Each day includes ranking, ten allocations,
fills, fees, unused cash, timeline, P/L and drawdown.

Historical acceptance remains closed: historicalNetPnlINR is null and
historicalBacktestStatus remains blocked pending complete authentic input and
independent source review. A caller boolean cannot open this gate.
Fixture results appear only in fixtureSummary.

evaluateResearchCouncil returns atlas.council.v1: six deterministic roles,
zero independent AI models, WAIT/SKIP, veto reasons and a trace hash. News
needs source attribution, publication/availability times, symbol relevance
and an exact title/text hash. Corrupt/future/contradictory evidence can veto;
summaries and role votes cannot override risk.

## Exact proposed shared-file changes for the other session

1. Add Node.js 24 setup and the command below to the existing CI workflow.
   This PR does not edit shared CI or schedules.

~~~sh
node --test tests/research/*.test.mjs
~~~

2. Add a separate research job importing authorized files through ingestCandleJson.
3. Add an explicit adapter in the strategy-lab endpoint/UI using the field table.
   Preserve fixture and source labels. Marked P/L is not an executed paper fill.
4. In ScalpStorm date/detail views consume days[] and recurringStocks. Keep
   historical totals null until independent data acceptance is complete.
5. Preserve scheduled paper ledger guards. Research never writes the forward
   ledger or counts toward verified forward-paper sessions.

No modification of PR #21 or another engineer's branch is needed.
