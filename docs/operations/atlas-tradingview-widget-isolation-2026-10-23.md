# Atlas Market Watch TradingView navigation-race isolation

Date: 2026-10-23. Source: official publicly embeddable TradingView Advanced Chart
widget. No stock exchange raw data API, broker, account tokens or live orders.

## Observed reproducible problem

Headless Chrome navigated all ten Atlas pages twice: desktop 1280 px and mobile
390 px. All 20 views rendered without document-level horizontal overflow.
Three to five intermittent uncaught exceptions were observed when navigating
through BSE Market Watch. CDP source attribution proved the error belonged to
`https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js`,
function `_replaceScript`, trying to query a parent container after React
had unmounted it. This was not proof of missing NSE market prices.

## Bounded fix

Preserve the official TradingView script and BSE symbol list, but run the
widget inside a nested `iframe srcDoc` with
`sandbox="allow-scripts allow-popups"`. Without `allow-same-origin`, the
third-party script cannot access Atlas's first-party cookies/localStorage,
and async teardown does not race the app document.

The parent CSP now narrowly allows same-origin srcDoc and the actually
observed nested iframe host `www.tradingview-widget.com`, alongside the
existing official TradingView frame hosts. Nothing opens API order permissions.
The provider retains control over data delay, iframe content and uptime.

## Verification

- Headless Chrome after fix: 20/20 page navigations (desktop/mobile),
  0 document-level overflow, 0 observed JavaScript exceptions.
- Browser DOM exposed a sandboxed srcDoc for BSE:RELIANCE. The Chrome
  target list showed the official nested advanced-chart iframe URL.
- Pure regression tests assert no first-party dynamic script injection,
  sandbox without same-origin, strict CSP hosts, and fixed BSE EOD symbols.
- TypeScript, Vite build, Node and Python regressions must pass before merge.
- Exact deployed CSP and rendered third-party chart are still a production
  acceptance gate, as Vercel Free returned HTTP 402 deployment quota.

Official widget documentation:
https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/

Do not claim source-consistent live NSE trade data from this visual widget.
