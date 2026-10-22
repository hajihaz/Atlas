import { requireThat, digest, freeze } from './core.mjs';
import { importDataset } from './data.mjs';
import { STRATEGIES } from './strategies.mjs';
import { simulate } from './simulation.mjs';

export function createResearchEnvelope({ dataset: input, results = null, config = {},
  audience = 'OWNER_ONLY' }) {
  const data = importDataset(input);
  requireThat(['OWNER_ONLY', 'THIRD_PARTY'].includes(audience), 'INVALID_RESEARCH_AUDIENCE');
  if (audience === 'THIRD_PARTY') requireThat(data.provenance.displayToThirdPartiesAllowed,
    'THIRD_PARTY_DISPLAY_RIGHTS_UNVERIFIED');
  const calculated = results ?? STRATEGIES.map(({ id }) => simulate({ dataset: data, strategyId: id, config }));
  requireThat(Array.isArray(calculated) && calculated.length > 0 && calculated.length <= 5
    && new Set(calculated.map(row => row.strategy?.id)).size === calculated.length,
    'INVALID_RESEARCH_RESULTS');
  for (const result of calculated) {
    requireThat(result?.schema === 'atlas.backtest.v1' && result.dataHash === data.hash
      && result.realOrdersEnabled === false && result.realOrdersPlaced === 0
      && result.paperLedgerWritten === false, 'RESULT_SOURCE_OR_EXECUTION_MISMATCH');
    const verified = simulate({ dataset: data, strategyId: result.strategy.id,
      parameters: result.strategy.parameters, config: result.config, evaluationStart: result.evaluationStart });
    // A caller cannot invent returns and merely recompute a self-declared checksum.
    requireThat(digest(result) === digest(verified), 'RESULT_REPLAY_MISMATCH');
  }
  const fixtureOnly = data.provenance.kind === 'SYNTHETIC_FIXTURE';
  const envelope = { schema: 'atlas.advanced-research.v1',
    mode: fixtureOnly ? 'SYNTHETIC_FIXTURE_REPLAY' : 'HISTORICAL_HYPOTHETICAL_REPLAY',
    generatedAt: new Date(data.provenance.retrievedAt).toISOString(), audience, fixtureOnly,
    symbol: data.instrument.id, currency: 'INR', intervalMs: data.intervalMs, barCount: data.candles.length,
    source: data.provenance, dataHash: data.hash, declaredGridComplete: data.quality.declaredGridComplete,
    externallyAudited: false, executableQuotesVerified: false,
    strategies: calculated.map(result => ({
      id: result.strategy.id, name: result.strategy.name, version: result.strategy.version,
      parameters: result.strategy.parameters, strategyHash: result.strategy.hash, resultHash: result.resultHash,
      capitalINR: result.initialCapitalINR, endingEquityINR: result.endingEquityINR,
      modeledReturnPct: result.returnPct, maxDrawdownPct: result.maxDrawdownPct,
      realizedPnlINR: result.realizedPnlINR, modeledNetPnlINR: result.netPnlINR,
      closedTrades: result.closedTrades, wins: result.wins, winRatePct: result.winRatePct,
      feesINR: result.feesINR, openQuantity: result.openQuantity,
      trades: result.fills, equity: result.equity, riskEvents: result.riskEvents, assumptions: result.assumptions,
    })),
    paperLedgerImportAllowed: false, paperOrdersExecuted: false, paperLedgerStored: false,
    liveOrdersEnabled: false, realOrdersPlaced: 0,
    label: fixtureOnly ? 'Artificial fixture demonstrates software behavior; no market performance.'
      : 'Source-candle hypothetical research; fills are modeled and are not forward-paper trades.' };
  return freeze({ ...envelope, envelopeHash: digest(envelope) });
}
export function assertResearchEnvelope(input) {
  requireThat(input?.schema === 'atlas.advanced-research.v1'
    && input.liveOrdersEnabled === false && input.realOrdersPlaced === 0
    && input.paperLedgerImportAllowed === false && input.paperOrdersExecuted === false
    && input.paperLedgerStored === false, 'INVALID_RESEARCH_ENVELOPE');
  requireThat(input.fixtureOnly === (input.source?.kind === 'SYNTHETIC_FIXTURE')
    && input.mode === (input.fixtureOnly ? 'SYNTHETIC_FIXTURE_REPLAY' : 'HISTORICAL_HYPOTHETICAL_REPLAY'),
    'FIXTURE_CLASSIFICATION_MISMATCH');
  const { envelopeHash, ...body } = input;
  requireThat(envelopeHash === digest(body), 'ENVELOPE_HASH_MISMATCH');
  return input;
}
