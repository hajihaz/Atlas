import test from 'node:test';
import assert from 'node:assert/strict';
import { decision as existingDecision } from '../../frontend/lib/research-engine.js';
import { STRATEGIES, strategySpec, evaluateStrategy } from '../../research/advanced/strategies.mjs';
import { makeDataset } from './fixtures.mjs';
test('five default strategy definitions agree with existing Atlas after existing warmup', () => {
  const bars = makeDataset().candles;
  for (const { id } of STRATEGIES) {
    const spec = strategySpec(id);
    for (let end = 28; end < bars.length; end++)
      assert.equal(evaluateStrategy(spec, bars.slice(0, end + 1)).action, existingDecision(id, bars, end),
        id + ' at closed bar ' + end);
  }
});
