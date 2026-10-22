import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, buyAndHold, checkpoint, replayFromCheckpoint } from '../../research/advanced/simulation.mjs';
import { makeDataset, noCosts, MINUTE } from './fixtures.mjs';

const sample = () => makeDataset({ closes: [4, 3, 2, 3, 5, 6, 6, 2, 1, 2, 4, 6] });
const run = (dataset = sample(), config = noCosts) => simulate({
  dataset, strategyId: 'sma_9_21', parameters: { fast: 2, slow: 3 }, config });
test('closed signal executes at next eligible opening price', () => {
  const data = sample(), result = run(data), fill = result.fills[0];
  assert.equal(fill.side, 'BUY');
  assert.equal(fill.time, data.candles[5].time);
  assert.equal(fill.priceINR, data.candles[5].open);
  assert.equal(fill.signalBarTime, data.candles[4].time);
  assert.equal(result.realOrdersEnabled, false);
  assert.equal(result.paperLedgerWritten, false);
});
test('no signal fill predates candle completion or publication', () => {
  const result = run();
  for (const fill of result.fills.filter(row => row.signalBarTime !== null)) {
    assert.ok(fill.time >= fill.signalBarTime + MINUTE);
    assert.ok(fill.time >= fill.signalAvailableAt);
  }
});
test('future price mutations cannot change earlier fills', () => {
  const data = sample(), altered = sample(), cutoff = data.candles[9].time;
  for (const bar of altered.candles.slice(9))
    for (const key of ['open', 'high', 'low', 'close']) bar[key] *= 3;
  assert.deepEqual(run(data).fills.filter(row => row.time < cutoff),
    run(altered).fills.filter(row => row.time < cutoff));
});
test('known-volume cap uses the previous bar rather than future bar volume', () => {
  const data = sample();
  data.candles[4].volume = 100;
  data.candles[5].volume = 1e8;
  const result = run(data, { ...noCosts, maxParticipation: 0.01 });
  assert.equal(result.fills[0].quantity, 1);
});
test('delayed publication cancels the otherwise retroactive fill', () => {
  const data = sample();
  data.candles[4].availableAt = data.candles[7].time;
  assert.ok(!run(data).fills.some(row => row.time === data.candles[5].time));
});
test('buying power includes fees, tick rounding and position allocation', () => {
  const result = run(sample(), { ...noCosts, feeBps: 50, fixedFeeINR: 2,
    slippageBps: 10, maxExposure: 0.25 });
  const fill = result.fills[0];
  assert.ok(fill.notionalINR + fill.feeINR <= 250);
  assert.ok(result.equity.every(row => row.cashINR >= 0));
  assert.ok(fill.priceINR > sample().candles[5].open);
});
test('NSE quantities remain whole shares', () => {
  const data = makeDataset({ ...sample(), closes: [4, 3, 2, 3, 5, 6, 6, 2, 1],
    assetClass: 'NSE_EQUITY' });
  assert.ok(run(data).fills.every(row => Number.isInteger(row.quantity)));
});
test('drawdown breach latches a halt and liquidates at a subsequent open', () => {
  const data = makeDataset({ closes: [4, 3, 2, 3, 5, 6, 1, 1, 2, 4, 8] });
  const result = run(data, { ...noCosts, maxDrawdownFraction: 0.2 });
  assert.equal(result.halted, true);
  const exit = result.fills.find(row => row.reason === 'MAX_DRAWDOWN');
  assert.equal(exit.time, data.candles[7].time);
  assert.equal(exit.priceINR, 1);
  assert.ok(!result.fills.some(row => row.side === 'BUY' && row.time > exit.time));
});
test('gap through stop executes at adverse opening price', () => {
  const data = makeDataset({ closes: [4, 3, 2, 3, 5, 6, 1, 1, 2],
    opens: [4, 4, 3, 2, 3, 5, 1, 1, 1] });
  const result = run(data, { ...noCosts, stopLossFraction: 0.1 });
  const exit = result.fills.find(row => row.reason === 'STOP_LOSS');
  assert.equal(exit.time, data.candles[6].time);
  assert.equal(exit.priceINR, 1);
});
test('terminal position stays marked rather than invented close liquidation', () => {
  const data = makeDataset({ closes: [4, 3, 2, 3, 5, 6, 7] });
  const result = run(data);
  assert.ok(result.openQuantity > 0);
  assert.equal(result.fills.at(-1).side, 'BUY');
  assert.ok(result.warnings.includes('SYNTHETIC_FIXTURE_NOT_MARKET_PERFORMANCE'));
});
test('buy-and-hold cost sensitivity is monotonically adverse on a rising fixture', () => {
  const dataset = makeDataset({ closes: Array.from({ length: 80 }, (_, i) => 100 + i) });
  const returns = [0, 10, 50].map(feeBps =>
    buyAndHold({ dataset, config: { ...noCosts, feeBps } }).endingEquityINR);
  assert.ok(returns[0] >= returns[1] && returns[1] >= returns[2]);
});
test('restart replay matches exact result; changed prefixes and settings are rejected', () => {
  const input = { dataset: sample(), strategyId: 'sma_9_21',
    parameters: { fast: 2, slow: 3 }, config: noCosts };
  const saved = checkpoint(input);
  assert.deepEqual(replayFromCheckpoint(input, saved), simulate(input));
  assert.throws(() => replayFromCheckpoint({ ...input, config: { ...noCosts, feeBps: 10 } }, saved),
    { code: 'CHECKPOINT_SETTINGS_MISMATCH' });
  const altered = sample(); altered.candles[0].volume += 1;
  assert.throws(() => replayFromCheckpoint({ ...input, dataset: altered }, saved),
    { code: 'CHECKPOINT_PREFIX_MISMATCH' });
});
test('checkpoint detects metadata corruption and a change in source classification', () => {
  const input = { dataset: sample(), strategyId: 'sma_9_21', config: noCosts };
  const saved = checkpoint(input), corrupt = structuredClone(saved); corrupt.resultHash = '0'.repeat(64);
  assert.throws(() => replayFromCheckpoint(input, corrupt), { code: 'CHECKPOINT_HASH_MISMATCH' });
  const altered = sample(); altered.provenance.displayToThirdPartiesAllowed = false;
  assert.throws(() => replayFromCheckpoint({ ...input, dataset: altered }, saved), { code: 'CHECKPOINT_SOURCE_MISMATCH' });
});
