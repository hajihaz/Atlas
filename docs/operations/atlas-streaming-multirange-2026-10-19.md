# Atlas INR streaming watch and provider-history charts — engineering acceptance

Date: 19 October 2026. Objective: support automatically updated INR crypto observations without hitting serverless REST endpoints once every second, plus selectable 1H/1D/1W/1M/1Y/5Y/ALL historical plots.

## Sources, meanings and boundaries

- Streaming: CoinDCX spot public Socket.IO channel `currentPrices@spot@1s`, event `currentPrices@spot#update`, direct WSS connection to `wss://stream-spot.coindcx.com`. CoinDCX documents a **1s update-channel interval**, not a guaranteed trade/new price every single second. The UI preserves the exchange's timestamp and displays its age. No artificial interpolation or clock-based price drift is allowed.
- The client uses a minimal, limited Engine.IO v4/v3 WebSocket adapter **without importing trade-capable SDKs**. The provider documentation recommends a full Socket.IO client; this narrow protocol adapter is independently contract-tested, but real browser streaming and negotiated protocol versions remain an acceptance gate. On blocked/rejected streams it automatically retries and retains the existing *15-second provider-backed read-only REST fallback*. No claim that unsupported browsers can receive a real 1-second feed.
- The Vercel CSP now allows WSS only to the exact public CoinDCX spot-stream host; no private socket channels or broker keys.
- Crypto supported watchlist: BTCINR, ETHINR, SOLINR, XRPINR, DOGEINR **only when provider actually returns each market**. Unreturned/unsupported pairs display unavailable, never zero or synthetic quotes. Underlying network is zero-credential, public/read-only.
- NSE symbols RELIANCE, TCS and INFY are selectable but explicitly report **authorised NSE market data not connected**. No chart is drawn and no unlicensed exchange feed is bypassed.
- Historical plots: `GET /api/market-history?symbol=BTCINR&range=1H` (and other allowlisted symbols/ranges), using documented CoinDCX INR spot `/market_data/candles` endpoint with hardcoded pair identifiers. 1H uses 1-minute candles, 1D uses 15-minute, 1W & 1M use hourly, and 1Y/5Y/ALL use daily. Long ranges are paginated, **max 8 chunks**, max 1000 bars per response, up to 8000 provider bars, and always bounded by available data. A blank or failed chunk is **not** replaced with interpolated OHLC.
- Every bar must be time-bounded, completed, numerically finite, valid OHLC/volume, and nonduplicate. This is a research-only history view; it does not establish paper brokerage fills, historical exchange licensing, execution-quality quotes, or certified lifetime completeness.
- `ALL` means *provider-available history attempted from 2013 under bounded limits*, not a promise to retrieve the full life of every asset. The response explicitly provides `completeHistoryVerified:false` and `coverage` / a warning.
- The chart displays actual provider-returned observations only, with optional actual exchange stream events appended. Downsampling for rendering is selection of existing points, never fabrication.

## User interface

- Live Paper Lab starts the public stream automatically (no button or manual refresh required); connection status shows actual STREAMING / CONNECTING / DISCONNECTED / REST fallback conditions.
- A 1-second IST **clock** remains independent of the 1-second exchange update channel. Price changes occur only when the provider produces a valid new update.
- Price cards are actionable, selecting their corresponding asset; no order buttons. Historical range controls remain visible and operate with keyboard access, on mobile and desktop, in light and dark themes.
- Exchange and candle sources are marked as indicative public market observations. Quotes stale after 90 seconds fail closed. Read-only REST fallback operates at most every 15 seconds if stream events stop arriving.

## Security, stability and remaining gates

- No account credentials, live-money orders, production DB edits, authenticated NSE quotes, simulated paper fills or claimed P&L are part of this feature.
- WebSocket transport is conditionally supported. If provider restrictions or version changes cause handshake failures, fallback resumes and UI does not falsely label the feed STREAMING.
- Browser compatibility / live WebSocket end-to-end acceptance requires a real browser session in addition to GitHub and Vercel static/unit tests.
- Serverless history availability requires verified provider responses per asset/time range; history may be unavailable or incomplete for a given pair.
- Monitor rate limits/cost. No continuous unattended backend process is started; WebSocket activity exists only while the Atlas page is open, and stops on unmount.

Official references:
- https://docs.coindcx.com/ — CoinDCX public spot Socket.IO and candle protocol.
- https://socket.io/docs/v4/client-api/ — Socket.IO protocol compatibility reference.

Acceptance: UI checks, TypeScript build, Node provider/stream unit tests, Python safety CI, Vercel preview and production route smoke tests for active assets; fail closed without permission for real trades.
