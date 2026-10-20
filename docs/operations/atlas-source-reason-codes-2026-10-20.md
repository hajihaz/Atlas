# Atlas paper-source failure classification — 20 October 2026

## Problem / observed evidence
The first genuine `atlas-paper-scheduled` schedule event was successful at the GitHub Actions job level, but the virtual report degraded and printed `invalid fresh market observation`. The committed source still had the previous 22:00 UTC completed bar and no modeled entries. A late GitHub schedule and/or stale provider history may cause this; **do not assert a specific cause** from old run logs.

## This isolated change
- Separate audited, zero-dependency `diagnosePaperSource` step in the existing paper runner, classifying known source failures: source contract, insufficient bars, 55-bar gap, stale completed candle, stale/future/invalid quote, quote older than its bar close, or validation error.
- Persist **only** reason code, checked timestamp and verified metadata in `lastSourceCheck` of the existing paper JSON. No private input, license-restricted data, actual trade, or fee changes.
- Classifier does not grant a buy/sell signal: the existing sourceEligible() and advanceCloud() validations still run independently and may reject any observation.
- Existing five virtual portfolios are neither reset nor backfilled. If a checkpoint fails, it remains DEGRADED; the GitHub Actions job reports success for safely persisting that degraded observation. CI verifies the classifier with synthetic fixtures only.

## Expectations and operator runbook
1. The next real scheduler event writes a reason code; inspect `/cloud-paper.json` > `lastSourceCheck.code` and actual GitHub Actions logs. Never claim an unobserved run happened.
2. If `CLOSED_CANDLE_TOO_OLD`: distinguish scheduled delay from provider history freshness using the actual new metadata; do not just raise the 45min market bar freshness cutoff.
3. If `QUOTE_TOO_OLD` or `QUOTE_BEFORE_BAR_CLOSE`: inspect provider quote timestamps and data contracts; do not invent replacement prices.
4. If `INSUFFICIENT_CLOSED_BARS` or `GAP_IN_55_COMPLETED_BARS`: only trade after enough authentic consecutive completed candles; do not interpolate gaps.
5. If `SOURCE_CONTRACT_INVALID` or provider unavailable: fail closed; do not extend source permissions or add unauthorized paid APIs.
6. Fix any provider-specific problem only after confirming the actual reason code and repeating an isolated test.

## Parallel integration policy
Astra owns advanced research and ScalpStorm in separate research modules. This PR modifies only the existing BTC/INR public-paper runner, pure diagnostics, and CI. A separate earlier PR #21 contains ledger hardening, comparison UI and other operations; merge these in CI-reviewed order, ensuring `frontend/public/cloud-paper.json` always reflects the latest genuine scheduled checkpoint. The newer public paper snapshot must never be overwritten by a feature branch.

**No new spending. Real-capital and broker execution blocked.**
