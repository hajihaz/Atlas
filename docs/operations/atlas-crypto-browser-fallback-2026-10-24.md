# Public crypto browser socket: observed rejection and safe fallback

The Atlas browser requests only CoinDCX public `currentPrices@spot@1s` over
`wss://stream-spot.coindcx.com/socket.io/`. On 24 October 2026 the Atlas
Origin handshake still received **HTTP/1.1 400 Bad Request** from the provider
at the Engine.IO v4 endpoint. A previous direct probe recorded 101 only with
the provider's own Origin. The response body gives no precise reason, so
the present observation is a rejected browser-compatible handshake—not proof
of a specific provider policy or a compatible protocol version. No Atlas
Origin spoof, relay, modified CSP, private socket channel or order API is used.

The on-page state remains `Stream disconnected · REST fallback every 15s`
while the public read-only `/api/live-feed` endpoint supplies CoinDCX INR
tickers. Both endpoint and browser UI use **provider event timestamps**, reject
future/stale (>90-second) and invalid quotes, and display `Unavailable` rather
than carrying a stale price. Cached endpoint responses now recompute
`feedStatus` as timestamps age, so an expired cached quote cannot retain the
`RECENT` label. If an actual INR stream event has not arrived for seven seconds,
the UI says `Stream idle for INR pairs · REST fallback every 15s`, even when
the underlying provider connection remains open. `RECENT` means at least one
fresh provider observation, **not** an active socket or executable quote.

Deterministic tests cover the cache-expiry boundary, failed provider, invalid
data, UI freshness wording, and the GET-only API. Browser checks separately
verified an actual recent REST quote with an increasing age label while the
socket was disconnected. The socket remains an external acceptance blocker;
an authorized provider Origin or a separately permitted replacement is needed
for verified 1-second browser streaming. The slower REST path is the safe
degraded operating mode, not a claim of live stock market data.
