import test from 'node:test';
import assert from 'node:assert/strict';
import { STRATEGIES } from '../../research/advanced/strategies.mjs';
import { simulate, checkpoint, replayFromCheckpoint } from '../../research/advanced/simulation.mjs';
import { verifyPrefixInvariance } from '../../research/advanced/evaluation.mjs';
import { makeDataset, noCosts } from './fixtures.mjs';
function path(seed, count = 120) {
  let value = 100, state = seed;
  return Array.from({ length: count }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    value *= 1 + (state / 4294967296 - 0.5) * 0.05;
    return value;
  });
}
for (let seed = 1; seed <= 12; seed++) test('seeded adversarial replay and accounting ' + seed, () => {
  const dataset = makeDataset({ closes: path(seed) });
  for (const { id: strategyId } of STRATEGIES) {
    const input = { dataset, strategyId };
    const result = simulate(input);
    assert.equal(verifyPrefixInvariance(input, 70).passed, true);
    assert.ok(result.equity.every(row => row.cashINR >= 0 && row.quantity >= 0));
    assert.ok(result.fills.every(row => row.executionType === 'HYPOTHETICAL_BAR_FILL'));
    assert.equal(result.feesINR, Math.round(result.fills.reduce((n, fill) => n + fill.feeINR, 0) * 100) / 100);
    assert.equal(replayFromCheckpoint(input, checkpoint(input)).resultHash, result.resultHash);
  }
});
test('a touched stop remains pending after zero available same-bar liquidity', () => {
  const dataset = makeDataset({ closes: [4, 3, 2, 3, 5, 6, 6, 7],
    opens: [4, 4, 3, 2, 3, 5, 6, 6] });
  dataset.candles[4].volume = 200;
  dataset.candles[5].low = 4;
  const result = simulate({ dataset, strategyId: 'sma_9_21',
    parameters: { fast: 2, slow: 3 }, config: { ...noCosts, stopLossFraction: 0.1 } });
  assert.ok(result.riskEvents.some(row => row.code === 'NO_EXIT_LIQUIDITY'));
  const exit = result.fills.find(row => row.reason === 'STOP_LOSS_PENDING');
  assert.equal(exit.time, dataset.candles[6].time);
});
test('current-bar stop and entry share a single lagged participation budget', () => {
  const dataset = makeDataset({ closes: [4, 3, 2, 3, 5, 6, 6, 7] });
  dataset.candles[4].volume = 300;
  dataset.candles[5].low = 4;
  const result = simulate({ dataset, strategyId: 'sma_9_21',
    parameters: { fast: 2, slow: 3 }, config: { ...noCosts, stopLossFraction: 0.1 } });
  const fills = result.fills.filter(row => row.time === dataset.candles[5].time);
  assert.ok(fills.reduce((n, fill) => n + fill.quantity, 0) <= 300);
});
