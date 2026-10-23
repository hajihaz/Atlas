# Acceptance — NSE data and ScalpStorm certification

**Owner-independent research/engineering delivered. Authentic historical
sessions certified: 0/20. Historical financial results remain null.**

Scope: 18 September–16 October 2026; ₹100,000 virtual capital, ten nominal
₹10,000 whole-share slots. No broker login, 2FA, orders, purchase, subscription
upgrade or production action. This package does not certify ScalpStorm's edge.

## Isolation and inspectable outputs

- Repository: `hajihaz/Atlas`.
- Base: `2527ec364be6ab80eaeb11e16103eee03281db31`.
- Branch: `astra/atlas-nse-data-certification-20261023`.
- HHC worktree: `/Users/hajihaz/projects/atlas-nse-certification-20261023`.
- Changes are confined to the new research, test and documentation directories
  plus one new offline CI workflow. Existing advanced research, Python replay,
  cloud-paper runtime/ledger, production configuration and deployments are untouched.
- PR #28 and integration PR #38 were inspected read-only; both were already
  merged. Their heads were not modified.
- Daily/monthly/trade exports are in [results](results/). They explicitly
  represent unverified financial values as JSON null / blank CSV fields with
  `UNVERIFIED` status. Missing data is never reported as zero profit or zero trades.

## Source evidence and actual coverage

**57 retained source snapshots** from 22–23 October UTC were checked against
their exact receipt byte lengths and SHA-256 values: 52 HTTP-200 responses and
five retained non-200 responses (two 401, two 404 and one 308). Request URLs,
retrieval times, selected response headers and hashes are in the four receipt
files linked from [sources.md](sources.md). Raw snapshots remain private under
the isolated worktree's `.ai/raw/nse-certification/snapshots` directory.
They are documents/reference metadata, not a market-price dataset.

The best archive lead is OLO commit
`0570761182b96724da3c43fdef547c139a3e93e8`, immutable tree
`fe5592007a4b9b7df35480feeba9456af4690d52`. The commit/tree/pinned-directory
cross-check passed. It has 456 stock archive names and 428 index archive names.
Five stock archive names intersect this request; no index archive names do.
The README understates its latest stock-file coverage. An inconsistent alias
tree identity field was detected and replaced by the immutable cross-check.
The original and corrected evidence receipts are retained.

| Scheduled session | Stock archive name in pinned OLO tree | Real session certified |
|---|---|---:|
| 2026-09-18 | `18092026.zip` | 0 |
| 2026-09-21 | `21092026.zip` | 0 |
| 2026-09-22 | `22092026.zip` | 0 |
| 2026-09-23 | `23092026.zip` | 0 |
| 2026-09-24 | `24092026.zip` | 0 |
| 2026-09-25 | Absent | 0 |
| 2026-09-28 | Absent | 0 |
| 2026-09-29 | Absent | 0 |
| 2026-09-30 | Absent | 0 |
| 2026-10-01 | Absent | 0 |
| 2026-10-05 | Absent | 0 |
| 2026-10-06 | Absent | 0 |
| 2026-10-07 | Absent | 0 |
| 2026-10-08 | Absent | 0 |
| 2026-10-09 | Absent | 0 |
| 2026-10-12 | Absent | 0 |
| 2026-10-13 | Absent | 0 |
| 2026-10-14 | Absent | 0 |
| 2026-10-15 | Absent | 0 |
| 2026-10-16 | Absent | 0 |

Presence is metadata evidence only: downloaded market archives **0**, inspected
real stock-minute rows **0**, verified historical eligibility snapshots **0**.
The candidate ZIPs' local SHA-256 fields remain null. Git blob SHA-1 values and
the other dataset's publisher-reported release digest are labelled as metadata,
not substituted for downloaded-byte verification. No financial replay used them.

Exact source URLs and rejection reasons for OLO, gsidhu, voletiramu, the
HTTP-401 Hugging Face candidate, djjain and the EOD pipeline are in the source
report. The official holiday circular establishes twenty scheduled cash
sessions, with 2 October excluded; it does not prove trading-data availability.

## Verified implementation

Public-document capture uses bounded unauthenticated GETs, exact-host and path
guards, redirect revalidation, size limits, no overwrite and durable receipt
journals. A 429 stops a batch. NSE website data APIs and market archives are
blocked as acquisition routes. Earlier unsupported URLs and a rejected query
selector were retained or removed safely without bypassing a source block.

Offline ingestion normalizes Upstox/FYERS JSON, strict Atlas CSV and typed
normalized JSON; hashes exact bytes; joins stable identities; requires explicit
share-volume and tick-size units; checks full grids, duplicates, timestamps,
OHLC consistency and corporate-action evidence. It never interpolates or
silently rounds a candle end label. Fractional receipt times round upward to
millisecond resolution. Actual timestamp authority remains a documentary gate.

The full-universe gate requires dated master, eligibility, suspension and
identity evidence, including the original artifacts. Current surviving lists,
EOD leaders and retrospective top-ten inputs fail. All four references must
precede opening; the candidate set must exactly equal eligibility minus
suspensions. Original prices, share volumes, identity/actions, recorded
publication and source-specific permitted use are independently reviewed against
the exact manifest. Hashes and caller booleans alone cannot establish those facts.

The new ranking independently sums every candidate's 09:15–09:29 share volumes,
then applies descending volume and symbol ties. Tests compare it with a separate
imperative oracle and the unchanged Atlas implementation. The replay bridge
preserves whole shares, slot budgets, illustrative fees/slippage, stops,
lagged-volume participation, realized/unrealized results, drawdown and stable-ID
selection frequency. It runs financial calculations only after all twenty
source sessions pass. Short eligibility and complete exits are further gates.
Synthetic engineering fixtures always certify zero real sessions.

Costs, the daily capital reset and ±0.15% NIFTY direction remain declared Atlas
research assumptions. Exact Groww UI/filter fidelity and executable tick fills
are unverified. See [contracts.md](contracts.md); no owner approval step is added.

## Verification

| Check | Result |
|---|---:|
| New Node ingestion/certification/ranking/replay/adversarial/export tests | 57 passed |
| New Python capture/archive/metadata/adversarial tests | 16 passed |
| Existing advanced-research regressions | 101 passed |
| Existing Python ScalpStorm regressions | 20 passed |
| Total distinct cases | **194 passed, 0 failed** |
| Ruff lint and formatting | Passed |
| All 57 retained snapshot hashes | Passed |
| Source-findings byte reproducibility | Passed |
| JSON + all three CSV export byte reproducibility | Passed |

The main verification used HHC Node 26.8.1 and Python 3.11.16. The same 57 new
Node cases also passed on Node 24 in the local runtime. The new CI workflow uses
Node 24/Python 3.11, runs the new and existing advanced tests offline, and compares
every acceptance export byte-for-byte. Hosted CI did not execute: both first-attempt jobs were blocked before a
runner started by GitHub's account payment/spending-limit restriction. No
hosted test pass is claimed, no rerun was requested and no billing setting was
changed. See [ci-startup-evidence.json](ci-startup-evidence.json) and the PR's
current checks. All workflow commands have local verification; no deployment
is part of this workflow. [verification.json](verification.json)
records commands, exit codes, source-file hashes and private log locations.
The schema envelopes are parsed by tests; cross-file certification uses the
tested runtime validators.

Adversarial checks cover source hash mutation, path/symlink escape, archive
traversal/bombs/CRC, duplicate JSON keys, missing/late/fractional minute records,
wrong volume units, retrospective/omitted/suspended members, adjusted prices,
future action knowledge, stale or unrelated grants, paid access, self-review,
changed manifests, unsafe redirects and rate limiting. Failed early checks
were repaired and reverified; no failed run was presented as a pass.

Selected exact raw-source SHA-256 values (all others are in the receipts):

| Source snapshot | SHA-256 |
|---|---|
| Official holiday PDF | `aa97e0afc0ce394097f2fc62631c68e3c2e4c7c23541ed35f21d9fc06b0dcacb` |
| NSE website terms | `8c24bab7c16337a6426b9a42fe232315a5dca5707d1c123e3220fa07f7c6732a` |
| Immutable OLO tree response | `22846683bb0f3dbb05dec4c0d7e0641798de3ad2c049450202d880a349d9f3a4` |
| Upstox account/private-use reply JSON | `0ec9518256189469c80ee7167effb253ab9fa64fa06ce7d8e152cc7f5bd2ee5e` |
| Acceptance report JSON bytes | `ab9bc6169ef3288f7506c5cd3b4c8fbab09035b12a8c8b6aed3352f6371f7b14` |

The complete delivered-file byte hashes are in `delivery-manifest.json`.

## Exact residual barrier and smallest external requirement

NSE website terms rule out website scraping as a paper-data route. A GitHub
software licence does not establish upstream market-data permission. Upstox's
published private-use guidance requires an account; its back-adjustment and
missing historical identity records do not supply this campaign's original
point-in-time evidence. Paid data products were excluded. No complete permitted
₹0 bundle for this exact period was independently validated.

The smallest external input is **one already-authorized source bundle plus its
applicable permission evidence**, covering:

1. The complete dated pre-open eligible stock universe for every session,
   including exclusions, suspensions and historical identity/action records.
2. Original minute OHLCV/share volumes for all candidates, NIFTY opening bars,
   raw-byte hashes and verifiable publication/revision history.
3. Permission for this private offline research and the intended sharing of
   derived results, at ₹0 additional cost. Raw redistribution is unnecessary.

An existing permitted export or a fee-waived exchange/provider arrangement could
supply this; neither is guaranteed to exist. A token alone does not supply the
missing historical records. This objective does not require the owner to log in,
pay, share credentials or authorize orders. For the supported export formats, once documentary evidence and files
are available, ingestion and certification can proceed without another software
implementation phase. Conditional prospective alternatives and their actual
quota/socket constraints are documented in [future-data.md](future-data.md).

The finite objective ends with the isolated PR and verified null-preserving
research deliverable. Historical performance certification remains blocked on
external source evidence; it is not represented as completed trading research.

The separate hosted-CI gate is GitHub account/allowance access. Resolving it must
stay within the zero-additional-spend rule; an upgrade or higher budget is not
requested. This gate does not invalidate the recorded local test results, and
it does not make historical market results verified.
