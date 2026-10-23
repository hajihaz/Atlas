import { runScalpStormDay } from '../advanced/scalpstorm.mjs';
import { check, instant, objectHash } from './normalize.mjs';
import { auditCampaign, auditSession } from './certify.mjs';

function round(value) { const rounded = Math.round((value + Number.EPSILON) * 100) / 100; return rounded === 0 ? 0 : rounded; }
export const REPLAY_ASSUMPTIONS = Object.freeze({
  ranking: '09:15-09:29 cumulative shares, all preopen eligible stocks, symbol tie break, decision 09:30 IST',
  direction: 'Existing Atlas research assumption: NIFTY first-15-minute move >0.15% long, <-0.15% short, else no trade',
  capital: '100000 INR reset per day; ten nominal 10000 INR slots; whole shares; no leverage',
  timing: '09:40 open entry; 15:00 open scheduled exit; hypothetical bar fills',
  costs: 'Illustrative 10 bps fee each side plus 5 bps adverse slippage each side; not actual broker tax reconciliation',
  risk: '2% stop; 5% participation using prior available minute volume; 10% slot drawdown halt',
  monthly: 'Sum of independent fixed-capital daily P&L / 100000; not a self-financing compounded account',
  fidelity: 'Atlas opening-volume methodology; Groww-exact universe/UI fidelity unverified',
  limitations: 'Minute OHLC cannot certify exact tick fills, queue priority, depth or executable liquidity',
});

export function toAdvancedInput(bundle, day, audited) {
  check(audited.technicalPass, 'TECHNICAL_AUDIT_REQUIRED_BEFORE_REPLAY');
  const members = audited.members;
  const { file: universeFile } = bundle.read(day.universeFileId, 'UNIVERSE');
  function source(file) {
    return { kind: bundle.manifest.kind, provider: file.sourceId, sourceUrl: file.sourceUrl,
      rawSha256: file.sha256, retrievedAt: instant(file.retrievedAt),
      researchUseAllowed: true, displayToThirdPartiesAllowed: false,
      licenseRef: 'Externally pinned independent review required by nse-certification wrapper',
      availabilityMode: 'RECORDED_PUBLICATION' };
  }
  function market(dataset, file, member) {
    return { schema: 'atlas.market.v1', intervalMs: 60000,
      instrument: { id: member?.symbol ?? 'NIFTY50', assetClass: member ? 'NSE_EQUITY' : 'NSE_INDEX',
        venue: 'NSE', currency: 'INR', lotSize: member?.lotSize ?? 1, priceTick: member?.priceTickINR ?? 0.05 },
      provenance: source(file), expectedTimes: dataset.rows.map(r => r.time),
      candles: dataset.rows.map(row => ({ ...row,
        availableAt: audited.publications.get(`${dataset.instrumentId}@${row.time}`).availableAt })),
      corporateActions: { reviewed: true, reviewedThrough: instant(audited.actions.reviewedThrough),
        sourceUrl: bundle.read(day.actionsFileId, 'ACTIONS').file.sourceUrl,
        actions: audited.actions.events.filter(a => a.instrumentId === dataset.instrumentId).map(a => ({
          type: a.type === 'BONUS' ? 'SPLIT' : a.type, effectiveAt: instant(a.effectiveAt), knownAt: instant(a.knownAt) })) } };
  }
  const datasets = audited.datasets.map(dataset => {
    const file = day.candleFileIds.map(id => bundle.files.get(id)).find(f => f.instrumentId === dataset.instrumentId);
    return market(dataset, file, members.find(m => m.id === dataset.instrumentId));
  });
  return { session: day.session,
    universe: { schema: 'atlas.universe.v1', completeEligibleUniverse: true,
      knownAt: instant(audited.universe.knownAt), provenance: source(universeFile),
      instruments: members.map(m => ({ id: m.symbol, availableAt: instant(m.knownAt),
        effectiveFrom: instant(m.effectiveFrom), effectiveTo: instant(m.effectiveTo), shortEligible: m.shortEligible })) },
    datasets, indexDataset: market(audited.index, bundle.files.get(day.indexFileId)),
    config: { initialCapitalINR: 100000, maxExposure: 1, feeBps: 10, sellFeeBps: 10,
      slippageBps: 5, maxParticipation: 0.05, stopLossFraction: 0.02, maxDrawdownFraction: 0.10 } };
}

export function dailyFinancials(result) {
  const realized = round(result.stocks.reduce((sum, s) => sum + (s.grossPnlINR ?? 0), 0) - result.feesINR);
  const marked = round(result.stocks.reduce((sum, s) => sum + (s.markedEquityINR ?? 10000 + (s.netPnlINR ?? 0)), 0));
  return { trades: result.stocks.flatMap(stock => stock.fills.map(fill => ({ symbol: stock.instrumentId, ...fill }))),
    realizedPnlINR: realized, unrealizedPnlINR: round(marked - 100000 - realized),
    netPnlINR: result.netPnlINR, feesINR: result.feesINR,
    returnPct: result.netPnlINR === null ? null : round(result.netPnlINR / 1000),
    maxDrawdownPct: result.maxDrawdownPct, endingEquityINR: marked,
    executionStatus: result.status };
}

function aggregate(days, results) {
  if (!days.length || days.some(d => !d.certified || d.netPnlINR === null))
    return { trades: null, netPnlINR: null, realizedPnlINR: null, unrealizedPnlINR: null,
      feesINR: null, returnPct: null, maxDrawdownPct: null, frequentlySelectedStocks: null };
  let cumulative = 0, peak = 100000, drawdown = 0;
  const frequencies = new Map();
  for (const day of days) {
    const result = results.get(day.session);
    for (const point of result.equity) {
      const value = point.equityINR + cumulative;
      peak = Math.max(peak, value); drawdown = Math.max(drawdown, (peak - value) / peak);
    }
    cumulative = round(cumulative + day.netPnlINR);
    peak = Math.max(peak, 100000 + cumulative);
    for (const selection of day.selected) {
      const key = selection.instrumentId;
      const row = frequencies.get(key) ?? { instrumentId: key, selections: 0, symbols: [] };
      row.selections++;
      if (!row.symbols.includes(selection.symbol)) row.symbols.push(selection.symbol);
      frequencies.set(key, row);
    }
  }
  return { trades: days.reduce((sum, d) => sum + d.trades.length, 0), netPnlINR: cumulative,
    realizedPnlINR: round(days.reduce((sum, d) => sum + d.realizedPnlINR, 0)),
    unrealizedPnlINR: round(days.reduce((sum, d) => sum + d.unrealizedPnlINR, 0)),
    feesINR: round(days.reduce((sum, d) => sum + d.feesINR, 0)), returnPct: round(cumulative / 1000),
    maxDrawdownPct: round(drawdown * 100),
    frequentlySelectedStocks: [...frequencies.values()].sort((a, b) => b.selections - a.selections
      || (a.instrumentId < b.instrumentId ? -1 : a.instrumentId > b.instrumentId ? 1 : 0)) };
}

export function replayCertified(bundle, options = {}) {
  const audited = auditCampaign(bundle, options);
  if (audited.report.realSessionsCertified !== 20) return audited.report;
  check(bundle.manifest.kind === 'HISTORICAL_MARKET', 'SYNTHETIC_INPUT_CANNOT_PUBLISH_HISTORY');
  const results = new Map();
  const daily = audited.report.daily.map(day => {
    const input = bundle.manifest.sessions.find(d => d.session === day.session);
    try {
      const data = auditSession(bundle, input), converted = toAdvancedInput(bundle, input, data);
      const shortsReviewed = audited.review.checks.shortEligibility === 'VERIFIED';
      const result = runScalpStormDay({ ...converted, shortModelEnabled: shortsReviewed });
      const independent = data.ranking.slice(0, 10).map(r => r.symbol);
      check(JSON.stringify(independent) === JSON.stringify(result.selected.map(r => r.id)), 'INDEPENDENT_RANKING_DISAGREEMENT');
      results.set(day.session, result);
      return { ...day, ...dailyFinancials(result), executionResultHash: result.resultHash };
    } catch (error) {
      return { ...day, executionStatus: 'BLOCKED', blockers: [...day.blockers,
        { gate: 'simulation', code: error.code ?? 'REPLAY_FAILED', detail: error.message }] };
    }
  });
  const total = aggregate(daily, results);
  const result = { ...audited.report, reportHash: undefined, assumptions: REPLAY_ASSUMPTIONS, daily,
    months: audited.report.months.map(m => ({ ...m, ...aggregate(daily.filter(d => d.session.startsWith(m.month)), results) })),
    historicalNetPnlINR: total.netPnlINR, historicalReturnPct: total.returnPct,
    historicalMaxDrawdownPct: total.maxDrawdownPct, frequentlySelectedStocks: total.frequentlySelectedStocks,
    financialStatus: total.netPnlINR === null ? 'BLOCKED_INCOMPLETE_EXECUTION_MODEL'
      : 'CERTIFIED_SOURCE_HYPOTHETICAL_REPLAY_NOT_EXECUTED_TRADES' };
  delete result.reportHash;
  return { ...result, reportHash: objectHash(result) };
}
