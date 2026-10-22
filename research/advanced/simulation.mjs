import { requireThat, epoch, digest, freeze, cents, round } from './core.mjs';
import { importDataset, closedPrefix } from './data.mjs';
import { strategySpec, evaluateStrategy } from './strategies.mjs';
import { executionConfig, executionPrice, liquidityLots, affordableLots,
  notionalCents, feeCents } from './execution.mjs';

export function simulate({ dataset: input, strategyId, parameters = {}, config: options = {},
  evaluationStart = null, benchmark = false }) {
  const dataset = importDataset(input), config = executionConfig(options);
  const spec = benchmark
    ? freeze({ id: 'buy_and_hold', version: 'advanced.1', hash: digest({ benchmark: 'buy_and_hold' }) })
    : strategySpec(strategyId, parameters);
  const start = evaluationStart === null ? dataset.candles[0].time : epoch(evaluationStart);
  requireThat(start >= dataset.candles[0].time && start <= dataset.candles.at(-1).time,
    'INVALID_EVALUATION_START');
  const initial = cents(config.initialCapitalINR), lot = dataset.instrument.lotSize;
  let cash = initial, positionLots = 0, entryCost = 0, stopPrice = null;
  let peak = initial, maxDrawdown = 0, realized = 0, roundTripPnl = 0, stopTriggered = false;
  let closedTrades = 0, wins = 0, halted = false, haltReason = null, benchmarkEntered = false;
  const fills = [], equity = [], riskEvents = [], signals = [];
  for (let i = 0; i < dataset.candles.length; i++) {
    const bar = dataset.candles[i];
    if (bar.time < start) continue;
    const history = closedPrefix(dataset, bar.time);
    const latest = history.at(-1);
    const timely = i > 0 && latest?.time === dataset.candles[i - 1].time;
    let remainingLots = timely ? liquidityLots(latest.volume, lot, config.maxParticipation) : 0;
    const signal = timely ? benchmark
      ? { action: !benchmarkEntered ? 'BUY' : 'HOLD', reason: 'BUY_AND_HOLD',
          signalBarTime: latest.time, availableAt: latest.availableAt }
      : evaluateStrategy(spec, history)
      : { action: 'HOLD', reason: 'NO_TIMELY_CLOSED_PREFIX' };
    signals.push({ time: bar.time, ...signal });
    function sell(reference, reason) {
      const soldLots = Math.min(positionLots, remainingLots);
      if (!soldLots) { riskEvents.push({ time: bar.time, code: 'NO_EXIT_LIQUIDITY', reason }); return; }
      const quantity = soldLots * lot, price = executionPrice(reference, 'SELL', config, dataset.instrument.priceTick);
      const notional = notionalCents(quantity, price, 'SELL'), fee = feeCents(notional, 'SELL', config);
      const allocatedCost = soldLots === positionLots ? entryCost : Math.round(entryCost * soldLots / positionLots);
      const pnl = notional - fee - allocatedCost;
      cash += notional - fee; entryCost -= allocatedCost; realized += pnl; roundTripPnl += pnl;
      positionLots -= soldLots; remainingLots -= soldLots;
      fills.push({ sequence: fills.length + 1, side: 'SELL', time: bar.time,
        signalBarTime: reason === 'SIGNAL_EXIT' ? latest.time : null,
        signalAvailableAt: reason === 'SIGNAL_EXIT' ? latest.availableAt : null,
        priceINR: price, quantity: round(quantity, 12), notionalINR: notional / 100,
        feeINR: fee / 100, realizedPnlINR: pnl / 100, reason,
        executionType: 'HYPOTHETICAL_BAR_FILL', liquidityBasisTime: latest?.time ?? null });
      if (!positionLots) {
        closedTrades++; if (roundTripPnl > 0) wins++;
        roundTripPnl = 0; stopPrice = null; stopTriggered = false;
      }
    }
    if (halted && positionLots) sell(bar.open, haltReason);
    else if (stopTriggered && positionLots) sell(bar.open, 'STOP_LOSS_PENDING');
    else if (signal.action === 'SELL' && positionLots) sell(bar.open, 'SIGNAL_EXIT');
    else if (signal.action === 'BUY' && !positionLots && !halted) {
      const price = executionPrice(bar.open, 'BUY', config, dataset.instrument.priceTick);
      const budget = Math.min(cash, Math.floor(cash * config.maxExposure));
      const bought = affordableLots(budget, price, lot, remainingLots, config);
      if (bought > 0) {
        const quantity = bought * lot, notional = notionalCents(quantity, price, 'BUY');
        const fee = feeCents(notional, 'BUY', config);
        cash -= notional + fee; positionLots = bought; entryCost = notional + fee;
        stopPrice = config.stopLossFraction === null ? null : price * (1 - config.stopLossFraction);
        remainingLots -= bought; benchmarkEntered = true;
        fills.push({ sequence: fills.length + 1, side: 'BUY', time: bar.time,
          signalBarTime: latest.time, signalAvailableAt: latest.availableAt,
          priceINR: price, quantity: round(quantity, 12), notionalINR: notional / 100,
          feeINR: fee / 100, realizedPnlINR: null, reason: benchmark ? 'BENCHMARK_ENTRY' : 'SIGNAL_ENTRY',
          executionType: 'HYPOTHETICAL_BAR_FILL', liquidityBasisTime: latest.time });
      } else riskEvents.push({ time: bar.time, code: 'INSUFFICIENT_CAPITAL_OR_LIQUIDITY' });
    }
    // Stops are pre-existing orders, modeled conservatively after open execution.
    // The same lagged volume budget is shared by entry, exit and stop fills.
    if (positionLots && stopPrice !== null && bar.low <= stopPrice) {
      sell(Math.min(bar.open, stopPrice), 'STOP_LOSS');
      stopTriggered = positionLots > 0;
    }
    const value = cash + cents(positionLots * lot * bar.close);
    requireThat(cash >= 0 && Number.isSafeInteger(value), 'INVALID_LEDGER_BALANCE');
    peak = Math.max(peak, value);
    const drawdown = (peak - value) / peak;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    if (!halted && drawdown >= config.maxDrawdownFraction) {
      halted = true; haltReason = 'MAX_DRAWDOWN';
      riskEvents.push({ time: bar.time + dataset.intervalMs, code: haltReason });
    }
    if (!halted && value > 0 && cents(positionLots * lot * bar.close) / value > config.maxExposure + 1e-10) {
      halted = true; haltReason = 'EXPOSURE_LIMIT';
      riskEvents.push({ time: bar.time + dataset.intervalMs, code: haltReason });
    }
    equity.push({ time: bar.time + dataset.intervalMs, equityINR: value / 100,
      cashINR: cash / 100, quantity: round(positionLots * lot, 12), drawdownPct: round(drawdown * 100) });
  }
  const ending = equity.at(-1).equityINR;
  const result = {
    schema: 'atlas.backtest.v1', mode: 'HISTORICAL_HYPOTHETICAL_REPLAY',
    dataKind: dataset.provenance.kind, instrumentId: dataset.instrument.id, currency: 'INR',
    dataHash: dataset.hash, strategy: spec, config, evaluationStart: start,
    initialCapitalINR: initial / 100, endingEquityINR: ending,
    netPnlINR: round(ending - initial / 100, 2), returnPct: round((ending / (initial / 100) - 1) * 100),
    realizedPnlINR: realized / 100, maxDrawdownPct: round(maxDrawdown * 100),
    closedTrades, wins, winRatePct: closedTrades ? round(wins / closedTrades * 100) : null,
    openQuantity: round(positionLots * lot, 12), openCostINR: entryCost / 100,
    feesINR: round(fills.reduce((sum, row) => sum + row.feeINR, 0), 2),
    fills, equity, signals, riskEvents, halted, haltReason,
    assumptions: { costs: 'ILLUSTRATIVE_CONFIGURABLE_NOT_BROKER_INVOICE',
      slippage: 'ADVERSE_TICK_ROUNDED', liquidity: 'PRIOR_COMPLETED_BAR_VOLUME_CAP',
      partialFills: true, drawdown: 'CLOSE_TO_CLOSE_HALT_AT_NEXT_ELIGIBLE_OPEN',
      terminalPosition: 'MARKED_NOT_RETROACTIVELY_LIQUIDATED',
      stopTimestamp: 'CONTAINING_BAR_START_NOT_EXACT_TICK',
      fillGuarantee: false, gridCoverage: 'DECLARED_INPUT_ONLY',
      publicationTimingAssumed: dataset.quality.publicationTimingAssumed },
    warnings: ['Hypothetical fills are not observed trades or paper-forward executions.',
      ...(dataset.provenance.kind === 'SYNTHETIC_FIXTURE' ? ['SYNTHETIC_FIXTURE_NOT_MARKET_PERFORMANCE'] : []),
      ...(closedTrades < 30 ? ['SMALL_SAMPLE_NO_PROFITABILITY_CERTIFICATION'] : [])],
    realOrdersEnabled: false, realOrdersPlaced: 0, paperLedgerWritten: false,
  };
  return freeze({ ...result, resultHash: digest(result) });
}
export function buyAndHold(input) {
  return simulate({ ...input, benchmark: true, config: { ...input.config,
    stopLossFraction: null, maxDrawdownFraction: 1 } });
}
export function checkpoint(input) {
  const dataset = importDataset(input.dataset), result = simulate(input);
  const body = { schema: 'atlas.replay-checkpoint.v1', bars: dataset.candles.length,
    instrument: dataset.instrument, intervalMs: dataset.intervalMs,
    prefixHash: digest(dataset.candles), strategyHash: result.strategy.hash, configHash: digest(result.config),
    sourceIdentityHash: sourceIdentity(dataset.provenance),
    evaluationStart: result.evaluationStart, resultHash: result.resultHash };
  return freeze({ ...body, checkpointHash: digest(body) });
}
function sourceIdentity({ rawSha256, retrievedAt, ...identity }) { return digest(identity); }
export function replayFromCheckpoint(input, saved) {
  requireThat(saved?.schema === 'atlas.replay-checkpoint.v1', 'INVALID_CHECKPOINT');
  const { checkpointHash, ...body } = saved;
  requireThat(checkpointHash === digest(body), 'CHECKPOINT_HASH_MISMATCH');
  const dataset = importDataset(input.dataset);
  requireThat(sourceIdentity(dataset.provenance) === saved.sourceIdentityHash, 'CHECKPOINT_SOURCE_MISMATCH');
  requireThat(Number.isSafeInteger(saved.bars) && saved.bars > 0 && saved.bars <= dataset.candles.length,
    'CHECKPOINT_LENGTH_MISMATCH');
  requireThat(digest(dataset.candles.slice(0, saved.bars)) === saved.prefixHash
    && digest(dataset.instrument) === digest(saved.instrument)
    && dataset.intervalMs === saved.intervalMs, 'CHECKPOINT_PREFIX_MISMATCH');
  const result = simulate(input);
  requireThat(result.strategy.hash === saved.strategyHash && digest(result.config) === saved.configHash
    && result.evaluationStart === saved.evaluationStart, 'CHECKPOINT_SETTINGS_MISMATCH');
  // Deterministic replay, not an incremental mutable ledger or an external-order resubmission.
  return result;
}
