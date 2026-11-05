# Forward paper reliability and VWAP pilot — 5 November 2026

This release is paper-only. It preserves existing fills and balances, uses the existing read-only broker credential, and adds no paid plan or real-order route.

## Changes

- Versioned risk policy v4 permits conservative partial exits, capped at one quarter of observed top-of-book quantity. Exact remaining shares and entry-cost allocation persist; the same provider timestamp cannot fill twice.
- Original exit intent survives expiration and price rebound. An expired exit can be requeued within the same scheduled tick. A newly queued exit gets at most one additional book request in that tick, and still requires a strictly later independent provider timestamp.
- Reports reconstruct one complete round trip across multiple reductions. Partial realized P&L is available separately; open equity remains unknown without marks. Charts use realized fills while closed-trade win rates require fully closed round trips.
- Independent X and VWAP paper pilot accounts share bounded settlement infrastructure and a two-entry-per-day pilot limit.
- VWAP computes captured-bar VWAP and EMA9 from verified 09:15–09:39 seeds plus continuous completed live receipts. It matches the existing research rule, persists immutable indicator/decision windows, rejects stale/future/gapped data and never submits historical warm-up signals.
- X2, X3, Xtreme, RSI-2 and Dual Momentum remain unarmed. Candidate Upstox GIFT/news receipt collection never certifies contract identity, company materiality or a trading direction.
- The final 15:14 bar has a separate 15:15 invocation using the existing Cron trigger slot family, independent of liquidation work. No archived missing receipt is manufactured.

## Evidence and limits

- Worker tests: 158 passed. Frontend tests: 206 passed. Production build and Worker dry-run passed before release.
- The updated report was checked against the seven saved genuine accounts without mutation. X's existing two closed trades and signed modeled fees remain unchanged.
- All 667 captured live receipt hashes from 4–5 November match their persisted content. 4 November lacks 14:41 and 15:14; 5 November lacks 15:14. After-close 375-bar archives are distinct evidence and do not repair those prospective gaps.
- The old deployed version's 5 November 09:15–15:30-window GraphQL observation reports 503 requests, zero invocation-level errors and a maximum CPU P99 field of 40278. This is a mixed-invocation observation, not a guarantee that each application step succeeded or that free-tier CPU headroom is safe.
- Authentic next-session evidence is required for the new VWAP pilot and changed exit behavior. Local fixture trades are never uploaded to the cloud ledger or represented as performance.
- Durable private verification artifacts and before-release account backup are under the existing project evidence directory.
