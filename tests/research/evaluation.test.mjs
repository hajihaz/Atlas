import test from 'node:test';
import assert from 'node:assert/strict';
import { walkForward, holdout, parameterSensitivity, costSensitivity, equalWeightBenchmark,
  wilsonInterval, uncertainty, verifyPrefixInvariance } from '../../research/advanced/evaluation.mjs';
import { simulate, buyAndHold } from '../../research/advanced/simulation.mjs';
import { makeDataset, fixtureProvenance, noCosts, T0, MINUTE } from './fixtures.mjs';
const grid = [{ fast: 3, slow: 8 }, { fast: 5, slow: 12 }];
const settings = dataset => ({ dataset, strategyId: 'sma_9_21', parameterGrid: grid,
  trainBars: 80, testBars: 40, config: noCosts });
test('walk-forward training and embargo precede each disjoint test window', () => {
  const result = walkForward(settings(makeDataset()));
  assert.equal(result.folds.length, 3);
  for (const fold of result.folds) {
    assert.ok(fold.trainEndExclusive <= fold.testStart - MINUTE);
    assert.ok(fold.outOfSample.fills.every(row => row.time >= fold.testStart));
    assert.equal(fold.trials.length, 2);
  }
  assert.equal(result.aggregation, 'INDEPENDENT_CASH_RESET_FOLDS_NOT_A_CONTINUOUS_PORTFOLIO');
});
test('changing test and future prices cannot choose different earlier training parameters', () => {
  const dataset = makeDataset(), altered = makeDataset();
  for (const row of altered.candles.slice(81))
    for (const key of ['open', 'high', 'low', 'close']) row[key] *= 1.5;
  const before = walkForward(settings(dataset)).folds[0];
  const after = walkForward(settings(altered)).folds[0];
  assert.deepEqual(before.chosenParameters, after.chosenParameters);
  assert.deepEqual(before.trials, after.trials);
});
test('holdout fits once and reports one unseen evaluation', () => {
  const result = holdout({ ...settings(makeDataset()), trainBars: 120 });
  assert.equal(result.folds.length, 1);
  assert.equal(result.folds[0].testEndExclusive, T0 + 240 * MINUTE);
});
test('parameter and transaction-cost sensitivity retain every trial', () => {
  const dataset = makeDataset();
  assert.equal(parameterSensitivity({ dataset, strategyId: 'sma_9_21', parameterGrid: grid }).length, 2);
  const costs = costSensitivity({ dataset, strategyId: 'sma_9_21',
    scenarios: [{ feeBps: 0, slippageBps: 0 }, { feeBps: 100, slippageBps: 20 }] });
  assert.equal(costs.length, 2);
  assert.ok(costs.every(row => Number.isFinite(row.returnPct)));
  assert.throws(() => parameterSensitivity({ dataset, strategyId: 'sma_9_21', parameterGrid: [grid[0], grid[0]] }),
    { code: 'DUPLICATE_PARAMETER_TRIAL' });
});
test('short histories cannot produce fake walk-forward results', () => {
  assert.throws(() => walkForward(settings(makeDataset({ count: 30 }))),
    { code: 'INSUFFICIENT_WALK_FORWARD_HISTORY' });
  assert.throws(() => walkForward({ ...settings(makeDataset()), embargoBars: 0 }));
});
function benchmarkInput() {
  const datasets = ['FIXTURE_A', 'FIXTURE_B'].map(id => makeDataset({ id }));
  const universe = { schema: 'atlas.universe.v1', completeEligibleUniverse: true, knownAt: T0,
    provenance: fixtureProvenance('equal-weight', T0),
    instruments: datasets.map(d => ({ id: d.instrument.id, availableAt: T0, effectiveFrom: T0, effectiveTo: null })) };
  return { datasets, universe, capitalINR: 100000, config: noCosts };
}
test('equal-weight portfolio allocates once and reconciles all members', () => {
  const result = equalWeightBenchmark(benchmarkInput());
  assert.equal(result.allocationINR, 50000);
  assert.equal(result.members.length, 2);
  assert.equal(result.endingEquityINR,
    Math.round(result.members.reduce((sum, row) => sum + row.endingEquityINR, 0) * 100) / 100);
});
test('benchmark refuses survivors-only subsets and mismatched calendars', () => {
  const input = benchmarkInput();
  input.datasets.pop();
  assert.throws(() => equalWeightBenchmark(input), { code: 'BENCHMARK_SURVIVORSHIP_OR_COVERAGE_MISMATCH' });
  const mismatched = benchmarkInput();
  mismatched.datasets[1] = makeDataset({ id: 'FIXTURE_B', start: T0 + MINUTE });
  assert.throws(() => equalWeightBenchmark(mismatched), { code: 'BENCHMARK_GRID_OR_PROVENANCE_MISMATCH' });
});
test('small win sample has broad uncertainty; zero trades does not report a win rate', () => {
  const interval = wilsonInterval(1, 1);
  assert.ok(interval.lower < 0.21);
  assert.equal(interval.upper, 1);
  assert.equal(wilsonInterval(0, 0).lower, null);
});
test('block bootstrap is seeded, reproducible and never a profitability certification', () => {
  const result = simulate({ dataset: makeDataset(), strategyId: 'sma_9_21' });
  assert.deepEqual(uncertainty(result), uncertainty(result));
  assert.equal(uncertainty(result).profitabilityCertified, false);
});
test('prefix replay proves no future rows are required for earlier fills and equity', () => {
  const result = verifyPrefixInvariance({ dataset: makeDataset(), strategyId: 'sps_pullback' }, 120);
  assert.equal(result.passed, true);
});
test('independent hand calculation: ten units bought at 100 and marked at 110 equals 1100', () => {
  const dataset = makeDataset({ closes: [100, 100, 110] });
  const result = buyAndHold({ dataset, config: noCosts });
  assert.equal(result.fills[0].quantity, 10);
  assert.equal(result.endingEquityINR, 1100);
  assert.equal(result.netPnlINR, 100);
  assert.equal(result.realizedPnlINR, 0);
});
