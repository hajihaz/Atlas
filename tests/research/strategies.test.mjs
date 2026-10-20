import test from 'node:test';
import assert from 'node:assert/strict';
import { strategySpec, evaluateStrategy, STRATEGIES, rsi, ema } from '../../research/advanced/strategies.mjs';
import { makeDataset } from './fixtures.mjs';

for (const [id, parameters, closes] of [
  ['sma_9_21', { fast: 2, slow: 3 }, [4, 3, 2, 3, 5]],
  ['ema_12_26', { fast: 2, slow: 3 }, [4, 3, 2, 3, 5]],
  ['rsi_14', { period: 2, entry: 30, exit: 60 }, [4, 3, 2, 3]],
  ['breakout_20', { entryBars: 3, exitBars: 2 }, [1, 2, 3, 4]],
  ['sps_pullback', { fast: 2, slow: 3 }, [2, 3, 4, 3.5, 5]],
]) test(id + ' has an independently specified entry example', () => {
  const signal = evaluateStrategy(strategySpec(id, parameters), makeDataset({ closes }).candles);
  assert.equal(signal.action, 'BUY');
  assert.equal(signal.reason, 'ENTRY_RULE');
});
test('flat RSI is 50; rising and falling RSI are 100 and 0', () => {
  assert.equal(rsi([5, 5, 5], 2), 50);
  assert.equal(rsi([1, 2, 3], 2), 100);
  assert.equal(rsi([3, 2, 1], 2), 0);
  assert.equal(ema([1, 2], 3), null);
});
test('all five strategies honor warmup and validate parameters', () => {
  for (const { id } of STRATEGIES)
    assert.equal(evaluateStrategy(strategySpec(id), []).reason, 'WARMUP');
  assert.throws(() => strategySpec('unknown'), { code: 'UNKNOWN_STRATEGY' });
  assert.throws(() => strategySpec('sma_9_21', { fast: 30 }), { code: 'INVALID_WINDOW_ORDER' });
  assert.throws(() => strategySpec('rsi_14', { entry: NaN }));
  assert.throws(() => strategySpec('rsi_14', { overrideRisk: true }), { code: 'UNKNOWN_PARAMETER' });
});
