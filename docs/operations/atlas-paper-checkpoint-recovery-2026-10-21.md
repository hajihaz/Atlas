# Forward paper checkpoint recovery

Status: verified local regression · Date: 2026-10-21 · Owner: Haji
Related: [checkpoint evidence](atlas-checkpoint-evidence-2026-10-20.md), [independent fill audit](atlas-paper-generated-fill-audit-2026-10-20.md)

The scheduled runner passed a candidate carrying the previous run's checkpoint evidence to the independent auditor. Once the published history existed, continuity validation rejected otherwise eligible observations. Recovery from a skipped interval also failed because the accounting auditor omitted the valid GAP_SKIPPED prior state.

A candidate now receives its current source diagnostic and single append-only proof before auditing. Failed candidates still preserve all prior portfolios and receive only a rejected-attempt record. The independent accounting reconstruction supplies an explicit OFFLINE_ACCOUNTING_ONLY record when retained history requires continuity; it never issues a second source PASS or persists its reconstruction.

The actual CLI regression uses isolated files and deterministic provider responses. It first skips a missed source interval without fills, then processes a consecutive eligible candle and independently verifies modeled fills. Unknown network requests fail. Legacy unit fixtures are fixed hypothetical data; a separate test validates the current published report without assuming its counter or history remains unchanged.

Verification: 177 frontend tests, 9 script tests, TypeScript and production build passed. Real orders remain disabled and actual capital remains zero. A real scheduled source observation after deployment is still required for operational acceptance; historical profits and missing runs are not reconstructed.
