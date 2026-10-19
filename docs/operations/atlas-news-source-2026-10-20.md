# Atlas free news observation adapter (20 October 2026)

## Goal
Provide a **source-attributed**, bounded news-reference card inside the existing six-role research council without inventing headlines, scores, trade suggestions or profits. This is not FinBERT sentiment or news fact-checking and does not authorize real or virtual orders.

## Provider
Primary candidate: https://cryptocurrency.cv — its README advertises free *hosted* API access but its repository is all-rights-reserved. We **do not clone, copy, import or redistribute its proprietary source code**. Publisher article rights remain separate, and API use must be rechecked against published terms for production. GDELT DOC 2.0 public ArticleList (https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) provides an independent fallback. Initial GDELT-only Vercel smoke calls timed out; provider redundancy is an experiment, **not a verified source guarantee**. Five allowlisted spot markets map to fixed keywords; no arbitrary public query string can be injected. Each bounded source request asks for at most eight article references; source responses are checked before use. Both requests time out safely; timestamps must be valid within a 36h maximum age; display up to five unique source URLs (three in UI), title and publisher hostname only. Publisher retains original content rights; no article body is copied.

The API is **best-effort** and can throttle, return non-JSON responses, incorrect stories, and unrelated matches. A missing/unavailable provider leads to a truthful empty/no-source state. It must never increase confidence of an automated strategy or change a WAIT/SKIP execution gate. Cached serverless response respects a 5-minute shared CDN timeout. News links are not independently verified; the selector is *keywords only*.

## Approval and risk
- ₹0 first: no API credentials, paid LLMs, new plan upgrades, broker keys, or customer data.
- Existing Atlas six-role deterministic council remains advisory only; risk veto remains unchanged.
- No speculative sentiment or model-weight imports. FinBERT weight licensing remains on hold.
- GDELT article metadata may be incomplete or wrong. News coverage is not a substitute for official filings/financial statements. Sourced publisher URLs are displayed with attribution; redistribution of protected articles is forbidden.
- Source timestamps represent when GDELT saw an article, not guaranteed original publication time; field in API is `seendate`, displayed as observedAt/publishedAt reference.
- Uphold provider quotas and publisher reuse restrictions. Operational or independent security/commercial redistribution certification is not implied by successful smoke checks.

## Acceptance
1. Source URL allowlist, JSON/content-type, timestamps, deduplication, URL protocol, length and failure contract tested.
2. UI is source-attributed and mobile responsive; Sentiment still visibly not connected.
3. GitHub TypeScript/build + Python CI pass; preview `/api/market-news?symbol=BTCINR` produces either clean metadata or an honest temporary 503.
4. No orders and no fake positive results, costs or misleading 'six autonomous Grok' claims.
5. Only merge/deploy if checks pass; record the production endpoint's actual status separately.
