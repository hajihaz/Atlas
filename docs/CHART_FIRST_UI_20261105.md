# Atlas chart-first paper workspace

Approved scope: replace the cramped paper-trading strategy/detail layout with a full-width chart workspace. Trading rules, account balances, capture jobs and real-order protections are unchanged.

## User-visible behavior

- Seven strategies in a horizontal mouse-draggable / touch-scrollable strip, with a keyboard-accessible select control.
- Recorded realized P&L curve, daily P&L and per-stock closed P&L. Day selections open the corresponding activity date; stock selections open its archived price chart.
- Date ranges cover retained records and end on the latest recorded activity date. The cumulative curve preserves inception P&L within a selected window and is explicitly not equity history.
- Stock/date controls, minute close-price and volume charts, zoom brush, hover prices, SMA20 and captured-bar VWAP overlays. RSI14 uses Wilder smoothing. No missing minutes are interpolated.
- Full chart expansion with Escape to restore, responsive tables and readable stock identifiers.
- Technical readings below the selected stock chart. Verified fundamentals remain unavailable.
- Recorded closed trades remain separate from historical research. Source hashes, policies, cost methods and detailed decisions are expandable. The event table shows at most 20 records before Load more.
- Existing owner session, quiet 15-second updates and signed CSV / JSON exports are preserved.

## Data boundaries

Performance charts require complete retained matched-trade history. Unfilled accounts show an empty state. Open-position gains and full equity history are never inferred from closed trades. Price receipts require the exact date/symbol, paper-only flags, a source hash, finite positive OHLC, nonnegative volume, valid candle bounds, ascending times and a timestamp in the selected IST date. Request sequencing prevents late stock responses replacing a later selection.

## Verification

Production build and 206 existing frontend tests pass. Authenticated browser verification uses the real read-only production gateway with the local candidate UI; the sole malformed receipt case is an isolated browser interception, never a cloud record.

Browser acceptance covers:
1. Recorded closed trades and accounting values.
2. Strategy dragging without accidental selection.
3. Selection of all seven strategy headings.
4. Daily activity drill-down.
5. Closed P&L stock attribution.
6. Actual archived prices, tooltip, zoom brush and indicators.
7. Rapid asynchronous stock switches.
8. Fail-closed handling of an invalid real-order flag.
9. 390, 768, 1440 and 2048 pixel widths without page overflow.
10. Signed CSV and JSON audit exports.
11. Quiet account refresh.
12. Paginated activity and collapsed source proof.
13. Honest unfilled-strategy empty state.
14. Dark-theme controls and tooltip surfaces with readable text.

Desktop and mobile screenshots reviewed. Private runtime evidence stays outside the release bundle in the existing evidence directory. Production acceptance is recorded separately after promotion.
