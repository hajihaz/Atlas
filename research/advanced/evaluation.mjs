import { requireThat, integer, finite, epoch, digest, freeze, round, compareIds } from './core.mjs';
import { importDataset, universeAt } from './data.mjs';
import { strategySpec } from './strategies.mjs';
import { simulate, buyAndHold } from './simulation.mjs';

export function sliceDataset(input, start, end) {
  const data = importDataset(input);
  integer(start, 'start'); integer(end, 'end');
  requireThat(end > start && end <= data.candles.length, 'INVALID_SLICE');
  const candles = data.candles.slice(start, end);
  return importDataset({ ...data, candles,
    expectedTimes: data.expectedTimes === null ? null : data.expectedTimes.slice(start, end) });
}
export function parameterSensitivity({ dataset, strategyId, parameterGrid, config = {} }) {
  requireThat(Array.isArray(parameterGrid) && parameterGrid.length > 0
    && parameterGrid.length <= 100, 'INVALID_PARAMETER_GRID');
  const data = importDataset(dataset), hashes = new Set();
  return freeze(parameterGrid.map(parameters => {
    const spec = strategySpec(strategyId, parameters);
    requireThat(!hashes.has(spec.hash), 'DUPLICATE_PARAMETER_TRIAL'); hashes.add(spec.hash);
    const result = simulate({ dataset: data, strategyId, parameters, config });
    return { parameters: spec.parameters, strategyHash: spec.hash, resultHash: result.resultHash,
      returnPct: result.returnPct, maxDrawdownPct: result.maxDrawdownPct,
      closedTrades: result.closedTrades, score: round(result.returnPct - result.maxDrawdownPct) };
  }));
}
export function walkForward({ dataset, strategyId, parameterGrid, trainBars, testBars,
  embargoBars = 1, config = {} }) {
  const data = importDataset(dataset);
  integer(trainBars, 'trainBars', { min: 3 });
  integer(testBars, 'testBars', { min: 2 });
  integer(embargoBars, 'embargoBars', { min: 1 });
  const folds = [];
  for (let testStart = trainBars + embargoBars;
    testStart + testBars <= data.candles.length; testStart += testBars) {
    const trainEnd = testStart - embargoBars, trainStart = trainEnd - trainBars;
    const train = sliceDataset(data, trainStart, trainEnd);
    const trials = parameterSensitivity({ dataset: train, strategyId, parameterGrid, config });
    const winner = [...trials].sort((a, b) => b.score - a.score
      || compareIds(a.strategyHash, b.strategyHash))[0];
    const evaluation = sliceDataset(data, trainStart, testStart + testBars);
    const test = simulate({ dataset: evaluation, strategyId, parameters: winner.parameters, config,
      evaluationStart: data.candles[testStart].time });
    folds.push({ fold: folds.length + 1, trainStart: data.candles[trainStart].time,
      trainEndExclusive: data.candles[trainEnd - 1].time + data.intervalMs,
      testStart: data.candles[testStart].time,
      testEndExclusive: data.candles[testStart + testBars - 1].time + data.intervalMs,
      trainingDataHash: train.hash, trials, chosenParameters: winner.parameters,
      chosenBeforeTestAt: data.candles[testStart].time,
      outOfSample: { resultHash: test.resultHash, returnPct: test.returnPct,
        netPnlINR: test.netPnlINR, maxDrawdownPct: test.maxDrawdownPct,
        closedTrades: test.closedTrades, fills: test.fills } });
  }
  requireThat(folds.length > 0, 'INSUFFICIENT_WALK_FORWARD_HISTORY');
  const result = { schema: 'atlas.walk-forward.v1', strategyId, dataKind: data.provenance.kind,
    dataHash: data.hash, selectionMetric: 'TRAIN_RETURN_MINUS_DRAWDOWN_PERCENT',
    embargoBars, trainBars, testBars, folds,
    aggregation: 'INDEPENDENT_CASH_RESET_FOLDS_NOT_A_CONTINUOUS_PORTFOLIO',
    meanOutOfSampleReturnPct: round(folds.reduce((sum, f) => sum + f.outOfSample.returnPct, 0) / folds.length),
    warnings: ['Parameter trials create selection bias; out-of-sample results do not certify an edge.',
      'Embargo excludes rows from fitting; already available embargo prices may warm up indicators.'],
    realOrdersEnabled: false };
  return freeze({ ...result, resultHash: digest(result) });
}
export function holdout({ dataset, strategyId, parameterGrid, trainBars, embargoBars = 1, config = {} }) {
  const data = importDataset(dataset);
  return walkForward({ dataset: data, strategyId, parameterGrid, trainBars, embargoBars,
    testBars: data.candles.length - trainBars - embargoBars, config });
}
export function costSensitivity({ dataset, strategyId, parameters = {}, scenarios, config = {} }) {
  requireThat(Array.isArray(scenarios) && scenarios.length > 0 && scenarios.length <= 100,
    'INVALID_COST_SCENARIOS');
  return freeze(scenarios.map(scenario => {
    requireThat(scenario && Object.keys(scenario).every(k => ['feeBps', 'sellFeeBps', 'slippageBps'].includes(k)),
      'INVALID_COST_SCENARIO');
    const result = simulate({ dataset, strategyId, parameters, config: { ...config, ...scenario } });
    return { scenario, resultHash: result.resultHash, returnPct: result.returnPct,
      feesINR: result.feesINR, maxDrawdownPct: result.maxDrawdownPct, closedTrades: result.closedTrades };
  }));
}
export function equalWeightBenchmark({ datasets, universe, capitalINR = 100000, config = {},
  evaluationStart = null }) {
  requireThat(Array.isArray(datasets) && datasets.length > 0 && datasets.length <= 100,
    'INVALID_BENCHMARK_UNIVERSE');
  finite(capitalINR, 'capitalINR', { min: 1, max: 1e10 });
  const data = datasets.map(d => importDataset(d));
  const at = evaluationStart === null ? data[0].candles[1]?.time : epoch(evaluationStart);
  requireThat(at, 'BENCHMARK_NEEDS_TWO_BARS');
  const membership = universeAt(universe, at);
  const ids = data.map(d => d.instrument.id).sort(compareIds);
  requireThat(new Set(ids).size === ids.length
    && JSON.stringify(ids) === JSON.stringify(membership.instruments.map(row => row.id)),
    'BENCHMARK_SURVIVORSHIP_OR_COVERAGE_MISMATCH');
  for (const d of data) {
    requireThat(d.provenance.kind === membership.source.kind && d.intervalMs === data[0].intervalMs
      && digest(d.candles.map(row => row.time)) === digest(data[0].candles.map(row => row.time)),
      'BENCHMARK_GRID_OR_PROVENANCE_MISMATCH');
  }
  const allocation = Math.floor(capitalINR * 100 / data.length) / 100;
  const remainder = round(capitalINR - allocation * data.length, 2);
  const results = data.map(dataset => buyAndHold({ dataset, evaluationStart: at,
    config: { ...config, initialCapitalINR: allocation } }));
  const equity = results[0].equity.map((row, i) => ({ time: row.time,
    equityINR: round(remainder + results.reduce((sum, result) => sum + result.equity[i].equityINR, 0), 2) }));
  let peak = capitalINR, drawdown = 0;
  for (const row of equity) {
    peak = Math.max(peak, row.equityINR); drawdown = Math.max(drawdown, (peak - row.equityINR) / peak);
  }
  return freeze({ schema: 'atlas.benchmark.v1', type: 'EQUAL_WEIGHT_BUY_AND_HOLD',
    dataKind: membership.source.kind, universeHash: membership.hash, capitalINR,
    allocationINR: allocation, unallocatedRemainderINR: remainder,
    endingEquityINR: equity.at(-1).equityINR, maxDrawdownPct: round(drawdown * 100),
    members: results.map(result => ({ instrumentId: result.instrumentId,
      resultHash: result.resultHash, endingEquityINR: result.endingEquityINR })), equity,
    rebalancing: 'NONE', realOrdersEnabled: false });
}
export function wilsonInterval(wins, count, z = 1.959963984540054) {
  integer(count, 'count'); integer(wins, 'wins', { max: count });
  if (!count) return { lower: null, upper: null, level: 0.95, count };
  const p = wins / count, denominator = 1 + z * z / count;
  const center = (p + z * z / (2 * count)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / count + z * z / (4 * count * count)) / denominator;
  return { lower: round(Math.max(0, center - half)), upper: round(Math.min(1, center + half)),
    level: 0.95, count };
}
export function uncertainty(result, { seed = 271828, samples = 400, blockSize = 5 } = {}) {
  requireThat(result?.schema === 'atlas.backtest.v1' && Array.isArray(result.equity), 'INVALID_BACKTEST_RESULT');
  integer(seed, 'seed', { max: 0xffffffff }); integer(samples, 'samples', { min: 100, max: 2000 });
  integer(blockSize, 'blockSize', { min: 1, max: 1000 });
  const returns = result.equity.slice(1).map((row, i) => row.equityINR / result.equity[i].equityINR - 1);
  requireThat(returns.every(Number.isFinite), 'INVALID_EQUITY_RETURNS');
  if (returns.length < Math.max(30, 2 * blockSize))
    return freeze({ status: 'INSUFFICIENT_SAMPLE', winRateInterval: wilsonInterval(result.wins, result.closedTrades),
      sampleBars: returns.length, profitabilityCertified: false });
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const means = [];
  for (let sample = 0; sample < samples; sample++) {
    const values = [];
    while (values.length < returns.length) {
      const start = Math.floor(random() * returns.length);
      for (let i = 0; i < blockSize && values.length < returns.length; i++)
        values.push(returns[(start + i) % returns.length]);
    }
    means.push(values.reduce((sum, n) => sum + n, 0) / values.length);
  }
  means.sort((a, b) => a - b);
  return freeze({ status: 'DESCRIPTIVE_ONLY', sampleBars: returns.length,
    meanBarReturnInterval: { lower: round(means[Math.floor(samples * 0.025)], 12),
      upper: round(means[Math.ceil(samples * 0.975) - 1], 12), level: 0.95,
      method: 'SEEDED_CIRCULAR_MOVING_BLOCK_BOOTSTRAP', seed, samples, blockSize },
    winRateInterval: wilsonInterval(result.wins, result.closedTrades), profitabilityCertified: false,
    warnings: ['Serial dependence, regime shifts and multiple testing limit interpretation.',
      ...(result.closedTrades < 30 ? ['SMALL_CLOSED_TRADE_SAMPLE'] : [])] });
}
export function verifyPrefixInvariance(input, prefixBars) {
  const data = importDataset(input.dataset);
  integer(prefixBars, 'prefixBars', { min: 2, max: data.candles.length - 1 });
  const prefix = simulate({ ...input, dataset: sliceDataset(data, 0, prefixBars) });
  const full = simulate(input), end = data.candles[prefixBars - 1].time + data.intervalMs;
  const actual = { fills: full.fills.filter(row => row.time < end),
    equity: full.equity.filter(row => row.time <= end) };
  const expected = { fills: prefix.fills, equity: prefix.equity };
  return freeze({ passed: digest(actual) === digest(expected), cutoff: end,
    expectedHash: digest(expected), actualHash: digest(actual) });
}
