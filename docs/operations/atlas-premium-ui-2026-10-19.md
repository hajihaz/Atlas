# Atlas — premium glass-dashboard UI acceptance (19 October 2026)

## Objective and scope

Restyle the **existing** Atlas quantitative research interface as a coherent
premium financial control center. Maintain the existing React/Vite application,
its research figures and source hashes, and every active screen:
Overview, Market Watch, Strategies, Research Lab, ScalpStorm X, Risk Center,
Orders & Activity and Audit & Evidence.

The supplied React / Framer Motion / Tailwind snippet is a **design reference**,
not production-ready source code. The release uses a real typed, reusable
React `PremiumStatCard` component, Lucide icons, responsive CSS glass surfaces,
gradient accents, a real archived-series sparkline and compositor-friendly CSS
animations. No Framer Motion or Tailwind packages were needed: the existing
project uses traditional CSS, and keeping its build footprint unchanged
reduces bundle and dependency risk.

## Visual implementation

- New branded overview hero with transparent research and capital-lock labels,
  subtle concentric animated rings and an *illustrative archived equity* card.
- Reusable stats component: variant accent, icon gradient, title, existing
  model value, existing sublabel and optional real historical sparkline.
- Shared visual language across the whole app: soft-light translucent surfaces,
  deep-navy dark glass, animated gradients only for decoration, cohesive
  card radii, separators, focus/hover states and responsive layouts.
- Animated page entrances and stat card reveals, tasteful hover lifts,
  a very slow orbit and gentle glass-stat float, all disabled for
  `prefers-reduced-motion: reduce`.
- Extra care for existing ScalpStorm X results, including light-mode
  legibility for dense ledger tables, timeline, allocations, fee panels and
  position-day breakdowns. No results, trade counts or constraints changed.
- Light-mode default, localStorage persistence and dark-mode toggle are
  unchanged; the new CSS is loaded **after** existing `styles.css`, so
  legacy selectors and page features remain in place.

## Non-negotiable factual constraints

- Historical SPY/AAPL equity, cohort returns and certification figures still
  come exclusively from `frontend/src/data/snapshot.json` with their
  existing archived/illustrative labels. They are **not** actual trading P&L.
- ScalpStorm X's 20 index sessions and 0/20 verified stock replays are not
  promoted to trades or profit. Missing historical stock trade records still
  display *UNAVAILABLE*, not zero.
- The Kraken public crypto ticker and closed-candle observation endpoints
  remain read-only. No order placement API, broker credential, live account
  access, capital gate, paper fill generation or private NSE redistribution
  is introduced.
- Existing journal, offline certification, risk gate and Python market
  services are untouched. Real-money trading stays **BLOCKED**.

## Release verification plan

- `npm ci --prefix frontend`, TypeScript noEmit, Vite production build.
- Existing unit/contract checks for quotes, closed candles, theme and
  ScalpStorm evidence, plus `frontend/tests/premium-ui.test.mjs`.
- `atlas-ui` CI must pass for the exact pull request and merged production SHA.
- `atlas-python-ci` should remain green on the protected default branch.
- Vercel git preview and production must be READY for the exact commits,
  and public overview, market-data GET endpoints and ScalpStorm report
  remain reachable.
- Physical browser-based visual acceptance on Safari/Chrome and iOS/Android
  remains distinct from static/CSS test verification. Do not claim it without
  actually exercising those environments.
