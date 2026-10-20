import { requireThat, finite, epoch, digest, freeze, round, cents, compareIds } from './core.mjs';
import { importDataset, universeAt } from './data.mjs';
import { NSE_SESSIONS, CALENDAR_EVIDENCE, sessionTime, minuteGrid } from './calendar.mjs';
import { executionConfig, executionPrice, liquidityLots, affordableLots, feeCents, notionalCents } from './execution.mjs';

function rankInputs({ session, universe, datasets }) {
  const open = sessionTime(session, 9, 15), decisionAt = sessionTime(session, 9, 30);
  const membership = universeAt(universe, decisionAt);
  requireThat(epoch(universe.knownAt) < open
    && membership.instruments.every(row => row.availableAt < open), 'PREOPEN_UNIVERSE_REQUIRED');
  requireThat(Array.isArray(datasets), 'MISSING_SCALPSTORM_DATASETS');
  const data = datasets.map(dataset => importDataset(dataset));
  const byId = new Map(data.map(dataset => [dataset.instrument.id, dataset]));
  requireThat(byId.size === data.length, 'DUPLICATE_SCALPSTORM_DATASET');
  const memberIds = membership.instruments.map(row => row.id);
  requireThat(memberIds.length >= 10 && byId.size === memberIds.length
    && memberIds.every(id => byId.has(id)), 'FULL_CANDIDATE_UNIVERSE_COVERAGE_REQUIRED');
  const rankingGrid = minuteGrid(session, 9, 15, 9, 30);
  const ranked = memberIds.map(id => {
    const dataset = byId.get(id);
    requireThat(dataset.instrument.assetClass === 'NSE_EQUITY' && dataset.instrument.venue === 'NSE'
      && dataset.intervalMs === 60000 && dataset.provenance.kind === membership.source.kind,
      'SCALPSTORM_MARKET_OR_PROVENANCE_MISMATCH');
    const rows = new Map(dataset.candles.map(row => [row.time, row]));
    let volume = 0;
    for (const time of rankingGrid) {
      const row = rows.get(time);
      requireThat(row && row.availableAt <= decisionAt, 'INCOMPLETE_POINT_IN_TIME_VOLUME');
      volume += row.volume;
    }
    requireThat(Number.isSafeInteger(volume), 'VOLUME_SUM_OVERFLOW');
    return { id, cumulativeShareVolume: volume, volumeThrough: decisionAt,
      dataHash: dataset.hash };
  }).sort((a, b) => b.cumulativeShareVolume - a.cumulativeShareVolume || compareIds(a.id, b.id));
  return { membership, byId, ranked, decisionAt };
}
export function selectScalpStorm(input) {
  const { membership, ranked, decisionAt } = rankInputs(input);
  return freeze({ schema: 'atlas.scalpstorm-selection.v1', session: input.session,
    decisionAt, universeHash: membership.hash, dataKind: membership.source.kind,
    rankingBasis: '09:15_TO_09:30_COMPLETED_AVAILABLE_CUMULATIVE_SHARE_VOLUME',
    ranked, selected: ranked.slice(0, 10), capitalINR: 100000, nominalAllocationINR: 10000,
    realOrdersEnabled: false });
}
function simulateSlot(dataset, session, direction, config) {
  const rows = new Map(dataset.candles.map(row => [row.time, row]));
  const required = minuteGrid(session), entryAt = sessionTime(session, 9, 40);
  const exitAt = sessionTime(session, 15, 0);
  requireThat(required.every(time => rows.has(time)), 'SELECTED_STOCK_SESSION_GAP');
  const entryBar = rows.get(entryAt), lag = rows.get(entryAt - 60000), lot = dataset.instrument.lotSize;
  requireThat(lag.availableAt <= entryAt, 'LATE_ENTRY_LIQUIDITY_EVIDENCE');
  const entrySide = direction === 'BUY' ? 'BUY' : 'SELL', exitSide = direction === 'BUY' ? 'SELL' : 'BUY';
  const sign = direction === 'BUY' ? 1 : -1, slot = 1000000; // ₹10,000, integer paise.
  const entryPrice = executionPrice(entryBar.open, entrySide, config, dataset.instrument.priceTick);
  const entryCap = liquidityLots(lag.volume, lot, config.maxParticipation);
  const bought = affordableLots(slot, entryPrice, lot, entryCap, config, entrySide);
  if (!bought) return { instrumentId: dataset.instrument.id, status: 'NO_AFFORDABLE_LIQUID_QUANTITY',
    direction, allocationINR: 10000, entryQuantity: 0, unusedCashINR: 10000,
    netPnlINR: 0, grossPnlINR: 0, feesINR: 0, openQuantity: 0, fills: [],
    equity: required.filter(t => t >= entryAt).map(time => ({ time, equityINR: 10000 })) };
  const entryNotional = notionalCents(bought * lot, entryPrice, entrySide);
  const entryFee = feeCents(entryNotional, entrySide, config);
  let cash = slot - entryNotional - entryFee, reserve = entryNotional, held = bought;
  let gross = 0, totalFees = entryFee, stopTriggered = false, halted = false, peak = slot;
  const stop = config.stopLossFraction === null ? null : entryPrice * (1 - sign * config.stopLossFraction);
  const fills = [{ side: entrySide, time: entryAt, quantity: bought * lot, priceINR: entryPrice,
    feeINR: entryFee / 100, reason: 'PREDECLARED_09_40_ENTRY',
    executionType: 'HYPOTHETICAL_BAR_FILL', liquidityBasisTime: lag.time }];
  const equity = [], riskEvents = [];
  for (const time of required.filter(t => t >= entryAt)) {
    const bar = rows.get(time), previous = rows.get(time - 60000);
    const knownVolume = previous.availableAt <= time ? previous.volume : 0;
    let capacity = liquidityLots(knownVolume, lot, config.maxParticipation);
    if (time === entryAt) capacity = Math.max(0, capacity - bought);
    const stopTouched = stop !== null && (direction === 'BUY' ? bar.low <= stop : bar.high >= stop);
    const pendingAtOpen = stopTriggered || halted, scheduledExit = time === exitAt;
    if (held && (pendingAtOpen || scheduledExit || stopTouched)) {
      const reference = pendingAtOpen || scheduledExit ? bar.open
        : direction === 'BUY' ? Math.min(bar.open, stop) : Math.max(bar.open, stop);
      const sold = Math.min(held, capacity);
      if (sold > 0) {
        const price = executionPrice(reference, exitSide, config, dataset.instrument.priceTick);
        const notional = notionalCents(sold * lot, price, exitSide);
        const fee = feeCents(notional, exitSide, config);
        const pnl = cents(sign * sold * lot * (price - entryPrice), 'down');
        const released = sold === held ? reserve : Math.floor(reserve * sold / held);
        reserve -= released; cash += released + pnl - fee; gross += pnl; totalFees += fee; held -= sold;
        fills.push({ side: exitSide, time, quantity: sold * lot, priceINR: price, feeINR: fee / 100,
          grossPnlINR: pnl / 100, reason: scheduledExit ? 'PREDECLARED_15_00_EXIT'
            : halted ? 'MAX_DRAWDOWN' : 'STOP_LOSS',
          executionType: 'HYPOTHETICAL_BAR_FILL', liquidityBasisTime: previous.time });
      }
      if (stopTouched || stopTriggered) stopTriggered = held > 0;
      if (held && !sold) riskEvents.push({ time, code: 'NO_EXIT_LIQUIDITY' });
    }
    const marked = cash + reserve + cents(sign * held * lot * (bar.close - entryPrice), 'down');
    peak = Math.max(peak, marked);
    if ((peak - marked) / peak >= config.maxDrawdownFraction) halted = true;
    equity.push({ time, equityINR: marked / 100 });
  }
  return { instrumentId: dataset.instrument.id,
    status: held ? 'INCOMPLETE_UNLIQUIDATED' : cash < 0 ? 'INSOLVENT_FIXTURE_OR_SCENARIO' : 'COMPLETE',
    direction, allocationINR: 10000, entryQuantity: bought * lot,
    usedCapitalINR: (entryNotional + entryFee) / 100,
    unusedCashINR: (slot - entryNotional - entryFee) / 100,
    netPnlINR: held ? null : (cash - slot) / 100, grossPnlINR: gross / 100,
    feesINR: totalFees / 100, openQuantity: held * lot,
    markedEquityINR: equity.at(-1).equityINR, fills, equity, riskEvents };
}
export function runScalpStormDay({ session, universe, datasets, indexDataset,
  config: options = {}, directionThreshold = 0.0015, shortModelEnabled = false }) {
  const { membership, byId, ranked, decisionAt } = rankInputs({ session, universe, datasets });
  const config = executionConfig(options);
  requireThat(config.initialCapitalINR === 100000 && config.maxExposure === 1,
    'SCALPSTORM_FIXED_CAPITAL_REQUIRED');
  finite(directionThreshold, 'directionThreshold', { min: 0, max: 0.1 });
  const index = importDataset(indexDataset);
  requireThat(index.instrument.assetClass === 'NSE_INDEX' && index.instrument.venue === 'NSE'
    && (index.instrument.id === 'NIFTY50' || index.provenance.kind === 'SYNTHETIC_FIXTURE'
      && index.instrument.id === 'FIXTURE_NIFTY') && index.intervalMs === 60000
    && index.provenance.kind === membership.source.kind, 'INVALID_NIFTY_DIRECTION_EVIDENCE');
  const indexRows = new Map(index.candles.map(row => [row.time, row]));
  const opening = minuteGrid(session, 9, 15, 9, 30);
  requireThat(opening.every(time => indexRows.has(time)
    && indexRows.get(time).availableAt <= decisionAt), 'MISSING_NIFTY_OPENING_WINDOW');
  const indexMove = indexRows.get(opening.at(-1)).close / indexRows.get(opening[0]).open - 1;
  const direction = indexMove > directionThreshold ? 'BUY'
    : indexMove < -directionThreshold ? 'SELL' : 'NO_TRADE';
  const selected = ranked.slice(0, 10);
  if (direction === 'SELL') requireThat(shortModelEnabled === true
    && selected.every(row => universe.instruments.find(member => member.id === row.id)?.shortEligible === true),
    'SHORT_ELIGIBILITY_UNVERIFIED');
  const stocks = direction === 'NO_TRADE' ? selected.map(row => ({
    instrumentId: row.id, status: 'NO_DIRECTIONAL_TRADE', direction, allocationINR: 10000,
    entryQuantity: 0, usedCapitalINR: 0, unusedCashINR: 10000, netPnlINR: 0,
    grossPnlINR: 0, feesINR: 0, openQuantity: 0, fills: [], equity: [],
  })) : selected.map(row => simulateSlot(byId.get(row.id), session, direction, config));
  const complete = stocks.every(row => row.openQuantity === 0);
  const timeline = direction === 'NO_TRADE' ? [] : stocks[0].equity.map((row, i) => ({
    time: row.time, equityINR: round(stocks.reduce((sum, stock) => sum + stock.equity[i].equityINR, 0), 2) }));
  let peak = 100000, maxDrawdown = 0;
  for (const row of timeline) { peak = Math.max(peak, row.equityINR); maxDrawdown = Math.max(maxDrawdown, (peak - row.equityINR) / peak); }
  const result = { schema: 'atlas.scalpstorm-day.v1', session, dataKind: membership.source.kind,
    status: complete ? 'COMPLETE_DECLARED_INPUT' : 'INCOMPLETE_UNLIQUIDATED',
    universeHash: membership.hash, indexHash: index.hash, ranked, selected, decisionAt,
    direction, indexMovePct: round(indexMove * 100), capitalINR: 100000, nominalAllocationINR: 10000,
    stocks, netPnlINR: complete ? round(stocks.reduce((sum, row) => sum + row.netPnlINR, 0), 2) : null,
    feesINR: round(stocks.reduce((sum, row) => sum + row.feesINR, 0), 2),
    unusedCashINR: round(stocks.reduce((sum, row) => sum + row.unusedCashINR, 0), 2),
    maxDrawdownPct: round(maxDrawdown * 100), equity: timeline, config,
    assumptions: { directionRule: 'EXISTING_ATLAS_NIFTY_OPENING_0_15_PERCENT_RESEARCH_ASSUMPTION',
      entry: '09:40_OPEN', scheduledExit: '15:00_OPEN', leverage: 1,
      shortModel: shortModelEnabled ? 'HYPOTHETICAL_FULL_COLLATERAL_ONLY' : 'DISABLED',
      costs: 'ILLUSTRATIVE_CONFIGURABLE_NOT_ACTUAL_BROKER_CHARGES',
      stopTiming: 'CONTAINING_MINUTE_NOT_EXACT_TICK', executableLiquidityVerified: false },
    externallyAudited: false, realOrdersEnabled: false, realOrdersPlaced: 0 };
  return freeze({ ...result, resultHash: digest(result) });
}
export function runScalpStormCampaign({ days = [] } = {}) {
  requireThat(Array.isArray(days) && days.length <= NSE_SESSIONS.length, 'INVALID_CAMPAIGN_INPUT');
  const results = days.map(day => runScalpStormDay(day)).sort((a, b) => compareIds(a.session, b.session));
  requireThat(new Set(results.map(row => row.session)).size === results.length, 'DUPLICATE_CAMPAIGN_SESSION');
  const kinds = new Set(results.map(row => row.dataKind));
  requireThat(kinds.size <= 1, 'MIXED_FIXTURE_AND_MARKET_CAMPAIGN');
  const fixtureOnly = kinds.has('SYNTHETIC_FIXTURE');
  const missingSessions = NSE_SESSIONS.filter(day => !results.some(row => row.session === day));
  let cumulative = 0, peak = 100000, maxDrawdown = 0, campaignComplete = true;
  const daily = results.map(row => {
    if (row.netPnlINR === null) campaignComplete = false;
    if (row.netPnlINR !== null && campaignComplete) {
      for (const point of row.equity) {
        const value = point.equityINR + cumulative;
        peak = Math.max(peak, value); maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak);
      }
      cumulative = round(cumulative + row.netPnlINR, 2);
      peak = Math.max(peak, 100000 + cumulative);
    }
    return { session: row.session, resultHash: row.resultHash, status: row.status,
      modeledNetPnlINR: row.netPnlINR, cumulativeModeledNetPnlINR: campaignComplete ? cumulative : null };
  });
  const frequencies = new Map();
  for (const row of results) for (const stock of row.stocks) {
    const record = frequencies.get(stock.instrumentId) ?? { instrumentId: stock.instrumentId, selections: 0, tradedSessions: 0 };
    record.selections++; if (stock.entryQuantity > 0) record.tradedSessions++;
    frequencies.set(stock.instrumentId, record);
  }
  return freeze({ schema: 'atlas.scalpstorm-campaign.v1',
    status: fixtureOnly ? 'FIXTURE_ONLY' : results.length === 20 && results.every(row => row.netPnlINR !== null)
      ? 'DECLARED_HISTORY_EXTERNAL_REVIEW_REQUIRED' : 'BLOCKED_MISSING_AUTHENTIC_HISTORY',
    historicalBacktestStatus: 'BLOCKED_PENDING_AUTHENTIC_DATA_AND_INDEPENDENT_SOURCE_REVIEW',
    historicalNetPnlINR: null, authenticPerformancePublished: false,
    calendar: CALENDAR_EVIDENCE, expectedSessions: NSE_SESSIONS, missingSessions,
    capitalPolicy: '100000_RESET_EACH_DAY_NO_COMPOUNDING', daily, days: results,
    fixtureSummary: fixtureOnly ? { cumulativeModeledNetPnlINR: campaignComplete ? cumulative : null,
      maxDrawdownPct: campaignComplete ? round(maxDrawdown * 100) : null,
      label: 'SYNTHETIC_FIXTURE_NOT_MARKET_PERFORMANCE' } : null,
    recurringStocks: [...frequencies.values()].sort((a, b) => b.selections - a.selections
      || compareIds(a.instrumentId, b.instrumentId)),
    realOrdersEnabled: false, realOrdersPlaced: 0 });
}
