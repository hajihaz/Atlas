/** Read-only ScalpStorm paper math. No broker permissions or order side effects. */
export type Direction = 'BUY' | 'SELL';
export type LeverageScenario = 1 | 2 | 5;
export const VIRTUAL_CAPITAL = 100000;
export const POSITION_COUNT = 10;
export const SLIPPAGE_BPS_PER_SIDE = 5;

export function estimateGrowwCharges(buyNotional: number, sellNotional: number) {
  if (![buyNotional, sellNotional].every(Number.isFinite) || buyNotional < 0 || sellNotional < 0) {
    throw new RangeError('invalid round-trip notional');
  }
  const brokerage = (n: number) => Math.min(20, Math.max(Math.min(5, n * 0.025), n * 0.001));
  const orderBrokerage = brokerage(buyNotional) + brokerage(sellNotional);
  const turnover = buyNotional + sellNotional;
  const exchange = turnover * 0.0000297;
  const sebi = turnover * 0.000001;
  const ipft = turnover * 0.000001;
  const gst = (orderBrokerage + exchange + sebi + ipft) * 0.18;
  const stt = sellNotional * 0.00025;
  const stamp = buyNotional * 0.00003;
  return { brokerage: orderBrokerage, exchange, sebi, ipft, gst, stt, stamp,
    total: orderBrokerage + exchange + sebi + ipft + gst + stt + stamp };
}

export function allocation(leverage: LeverageScenario = 1) {
  const capitalPerSlot = VIRTUAL_CAPITAL / POSITION_COUNT;
  return { capital: VIRTUAL_CAPITAL, slots: POSITION_COUNT, capitalPerSlot, margin: leverage,
    exposurePerSlot: capitalPerSlot * leverage, totalExposure: VIRTUAL_CAPITAL * leverage,
    borrowedExposure: VIRTUAL_CAPITAL * (leverage - 1) };
}

export function estimateWhatIf(leverage: LeverageScenario, favorableMovementPct: number, direction: Direction = 'BUY') {
  if (!Number.isFinite(favorableMovementPct) || Math.abs(favorableMovementPct) > 50)
    throw new RangeError('price movement outside accepted range');
  const a = allocation(leverage);
  const entry = a.exposurePerSlot;
  const exit = entry * (1 + (direction === 'BUY' ? 1 : -1) * favorableMovementPct / 100);
  const buy = direction === 'BUY' ? entry : exit;
  const sell = direction === 'BUY' ? exit : entry;
  const fees = estimateGrowwCharges(buy, sell);
  const gross = entry * favorableMovementPct * a.slots / 100;
  const charges = Object.fromEntries(Object.entries(fees).map(([key,v]) => [key,v*a.slots])) as Record<keyof typeof fees, number>;
  const slippage = (buy + sell) * SLIPPAGE_BPS_PER_SIDE / 10000 * a.slots;
  return { ...a, assumedMovePct:favorableMovementPct, direction, grossTotal:gross, costs:charges,
    estimatedFeeTotal:charges.total, estimatedSlippageTotal:slippage,
    estimatedNetTotal:gross - charges.total - slippage, status:'HYPOTHETICAL_NOT_HISTORICAL' as const };
}

export interface VerifiedStockTrade {
  symbol:string; side:Direction; shares:number; opening_volume:number;
  entry:string; exit:string; gross_pnl:string; estimated_charges:string;
  net_pnl:string; exit_reason:string;
}
export interface ReportDay {
  date:string; status:string; indexSignal:'BUY'|'SELL'|'NO_TRADE';
  niftyOpeningChangePct:string; trades: VerifiedStockTrade[] | null;
  netPnl:string | null; selected:string[] | null;
  stockEvidence?: {
    pointInTimeUniverseVerified:boolean; selectedMinuteBarsComplete:boolean;
    sourceSha256:string; universeSha256:string;
  };
}
export function verifiedTrades(day:ReportDay, verifiedSessions:number): VerifiedStockTrade[] | null {
  if (verifiedSessions < 1 || day.status!=='STOCK_BACKTEST_VERIFIED' ||
      !Array.isArray(day.trades) || day.trades.length !== POSITION_COUNT ||
      !Array.isArray(day.selected) || day.selected.length !== POSITION_COUNT || day.netPnl===null ||
      day.stockEvidence?.pointInTimeUniverseVerified !== true ||
      day.stockEvidence?.selectedMinuteBarsComplete !== true ||
      !/^[a-f0-9]{64}$/.test(day.stockEvidence?.sourceSha256 ?? '') ||
      !/^[a-f0-9]{64}$/.test(day.stockEvidence?.universeSha256 ?? '') ||
      new Set(day.selected).size !== POSITION_COUNT) return null;
  if (day.trades.some(t => !t || !day.selected?.includes(t.symbol) || !['BUY','SELL'].includes(t.side) ||
    !Number.isInteger(t.shares) || t.shares < 1 || !Number.isInteger(t.opening_volume) || t.opening_volume < 0 ||
    ![t.entry,t.exit,t.gross_pnl,t.estimated_charges,t.net_pnl].every(v=>v!=='' && Number.isFinite(Number(v))))) return null;
  if (new Set(day.trades.map(t=>t.symbol)).size !== POSITION_COUNT ||
      day.trades.some(t=>t.side !== day.indexSignal) ||
      !Number.isFinite(Number(day.netPnl)) ||
      Math.abs(day.trades.reduce((sum,t)=>sum+Number(t.net_pnl),0)-Number(day.netPnl)) > 0.05) return null;
  return day.trades;
}
