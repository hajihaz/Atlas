# Advanced research mission acceptance

This report covers the assigned advanced A–F engineering half, not all of
Atlas and not strategy profitability. The cloud-runtime session still owns
production integration and release.

Branch: astra/atlas-advanced-research-engine. Base:
c3c0dd287c68ae6faf4471edda1321b0a7c05df3.
The PR's commit and changed-files list are the immutable delivery reference.

## Delivered scope

| Workstream | Implemented and verified |
| --- | --- |
| A: market data | CoinDCX handling review; generic crypto/NSE contracts; raw-byte import receipts; explicit timestamps/publication; duplicates, gaps and action gates; historical/quote/fixture/fill separation; as-of membership; official 20-session calendar; free-source/access findings |
| B: strategies | Five default rules with existing-engine parity; next-eligible-open execution; fees, slippage, lots, allocation/participation; stops and exposure/drawdown halts; full fills/equity; walk-forward, holdout, parameter/cost sensitivity; buy-and-hold/equal-weight benchmarks |
| C: ScalpStorm | Full-universe opening-volume ranking; no future volume; ten ₹10,000 slots; whole shares/cash/costs; explicit short-scenario gate; daily/campaign details, P/L, drawdown and recurring stocks; incomplete results null; missing authentic campaign blocked |
| D: six roles | Source/news quality, relevance, duplicate/freshness/content checks; original transparent sentiment heuristic and alternative assessment; chart/regime evidence; independent deterministic risk veto; audited WAIT/SKIP with zero independent AI models |
| E: ten repositories | Current source revisions, licenses, dependency indicators, maintenance dates, repository-advisory observations and cost boundaries; adopt/adapt/benchmark/defer/reject decisions; four isolated FinRL method checks, two actual LEAN backtest fixtures and one compression runtime check |
| F: quantitative engineering | Unit/integration tests; seeded adverse paths; independent hand-calculated benchmark; future-price/rank invariance; missing/reordered/late data; train/test isolation; uncertainty/small-sample warnings; risk and liquidity limits; restart/checkpoint integrity; deterministic report hashing |

## Verification

| Command/check | Observed result |
| --- | --- |
| node --test tests/research/*.test.mjs | 101 passed, 0 failed, 0 skipped on Node 24 and HHC Node 26 |
| node research/advanced/certify.mjs | All research tests pass; deterministic evidence hash recorded; historical/profitability certification false |
| node --test frontend/tests/*.test.mjs scripts/tests/*.test.mjs | 124 passed, 0 failed |
| /opt/homebrew/bin/python3.11 -m pytest -q --disable-warnings | 533 passed, 7 skipped |
| FinRL isolated method check | 4 expected contract cases passed; minimal DataFrame shim disclosed |
| LEAN isolated fill check | 2 actual backtest fixtures passed; live false; OS network denied |
| Existing LEAN Compression assembly | 1 byte-for-byte ZIP round-trip check passed |
| Ruff, JavaScript syntax and Git whitespace/ownership | See final acceptance evidence JSON for completed checks |

Python skips: six require isolated PostgreSQL configuration; one requires real
LEAN cohort sample data. Production databases were not used. Full external
framework dependency audits and package installations were not performed.

The machine [certification](certification.json) binds source hashes, test count,
walk-forward and prefix-invariance results. The
[fixture dashboard envelope](fixture-dashboard-envelope.json) is explicitly
artificial and has ledger/execution permissions false.

## Authentic historical results

**No authentic ScalpStorm historical P/L is claimed.** The calendar verifies
20 scheduled sessions; the historical campaign remains blocked with null P/L.
One Upstox anonymous request did return 375 minute candles for one instrument,
but it does not establish all-candidate history, historical eligibility or
intended-use rights. No September–October performance was fabricated.

## Integration and external gates

The other session should consume [integration.md](integration.md), including
the exact proposed shared CI/job/API/UI changes. Research must remain separate
from forward-paper ledger persistence and session certification.

Final API/owner-stage items:

1. Verify provider permissions for private research and any third-party display.
2. Obtain and audit full preopen eligible universes for all 20 sessions.
3. Obtain authentic candidate opening bars and selected trading windows with
   hashes, timing, corporate actions and liquidity/short-eligibility evidence.
4. If supported sustained access requires it, connect an owner-approved
   read-only provider token in the final integration phase.
5. Validate owner strategy parameters before treating ScalpStorm's existing
   NIFTY direction threshold/timing assumptions as a production rule.

No owner credentials, purchase, new subscription or provider login was requested.
No main push, merge or production deployment belongs to this deliverable.
PR #21 and the scheduled paper/runtime/UI/config files were not edited.
Unrelated working-tree/AGENTS changes were preserved and excluded from the PR.

## Scope completion

The allowed fixture-backed engineering deliverable is complete when its final
acceptance evidence passes and its unmerged PR is verified. This does not open
the authentic historical, production integration, data-rights or real-capital
gates. Useful further framework/model experiments remain a separate backlog.
