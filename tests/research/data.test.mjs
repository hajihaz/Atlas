import test from 'node:test';
import assert from 'node:assert/strict';
import { epoch, digest, stableStringify } from '../../research/advanced/core.mjs';
import { importDataset, importCoinDCX, closedPrefix, universeAt, validateQuote } from '../../research/advanced/data.mjs';
import { makeDataset, fixtureProvenance, T0, MINUTE } from './fixtures.mjs';

const fails = (input, code) => assert.throws(() => importDataset(input), { code });
test('timestamps normalize explicit offsets and explicit epoch units', () => {
  assert.equal(epoch('2026-09-18T05:30:00+05:30'), T0);
  assert.equal(epoch(T0 / 1000, 's'), T0);
  for (const value of ['2026-09-18T00:00:00', '2026-02-30T00:00:00Z', '2026-09-18T24:00:00Z'])
    assert.throws(() => epoch(value));
});
test('canonical evidence hashes are stable across key insertion order', () => {
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
  assert.throws(() => stableStringify({ bad: NaN }));
});
test('import validates and freezes records while preserving fixture identity', () => {
  const data = importDataset(makeDataset());
  assert.equal(data.quality.priceType, 'SYNTHETIC_FIXTURE');
  assert.equal(data.quality.externallyAudited, false);
  assert.throws(() => { data.candles[0].close = 1; }, TypeError);
  assert.equal(importDataset(data).hash, data.hash);
});
for (const [name, mutate, code] of [
  ['duplicate timestamp', d => d.candles.splice(1, 0, d.candles[0]), 'DUPLICATE_CANDLE'],
  ['reordered bars', d => [d.candles[0], d.candles[1]] = [d.candles[1], d.candles[0]], 'REORDERED_CANDLES'],
  ['missing interval', d => d.candles.splice(20, 1), 'MISSING_CANDLE'],
  ['invalid OHLC', d => d.candles[1].high = 0.1, 'INCONSISTENT_OHLC'],
  ['negative volume', d => d.candles[1].volume = -1, 'INVALID_NUMBER'],
  ['nonfinite close', d => d.candles[1].close = Infinity, 'INVALID_NUMBER'],
  ['unfinished candle', d => d.provenance.retrievedAt = T0 + MINUTE, 'UNFINISHED_OR_FUTURE_CANDLE'],
  ['premature availability', d => d.candles[0].availableAt = T0, 'PREMATURE_CANDLE_AVAILABILITY'],
  ['missing rights', d => d.provenance.researchUseAllowed = false, 'RESEARCH_RIGHTS_UNVERIFIED'],
  ['mixed trade provenance', d => d.provenance.kind = 'SIMULATED_FILL', 'INVALID_PROVENANCE_KIND'],
]) test('rejects ' + name, () => { const data = makeDataset(); mutate(data); fails(data, code); });
test('delayed bars cannot enter an earlier closed prefix', () => {
  const data = makeDataset();
  data.candles[2].availableAt = T0 + 6 * MINUTE;
  assert.equal(closedPrefix(importDataset(data), T0 + 4 * MINUTE).length, 2);
});
test('CoinDCX adapter sorts newest-first input, validates duplicates and never fills gaps', () => {
  const data = makeDataset({ count: 20 });
  const options = { provenance: data.provenance, instrument: data.instrument, intervalMs: MINUTE };
  const rows = data.candles.map(({ availableAt, ...row }) => row).reverse();
  assert.equal(importCoinDCX(rows, options).candles[0].time, T0);
  assert.throws(() => importCoinDCX([...rows, rows[0]], options), { code: 'DUPLICATE_CANDLE' });
  assert.throws(() => importCoinDCX(rows.slice(0, 4).concat(rows.slice(5)), options), { code: 'MISSING_CANDLE' });
});
test('equity data requires declared grid and reviewed corporate actions', () => {
  const data = makeDataset({ assetClass: 'NSE_EQUITY' });
  assert.equal(importDataset(data).instrument.lotSize, 1);
  delete data.expectedTimes; fails(data, 'EQUITY_GRID_REQUIRED');
});
test('split crossing raw history is rejected rather than treated as price collapse', () => {
  const data = makeDataset({ assetClass: 'NSE_EQUITY' });
  data.corporateActions.actions = [{ type: 'SPLIT', effectiveAt: T0 + MINUTE, knownAt: T0 }];
  fails(data, 'UNRESOLVED_CORPORATE_ACTION');
});
test('corporate action coverage cannot silently stop early', () => {
  const data = makeDataset({ assetClass: 'NSE_EQUITY' });
  data.corporateActions.reviewedThrough = T0;
  fails(data, 'CORPORATE_ACTION_COVERAGE_GAP');
});
test('point-in-time membership includes a then-listed stock even if later delisted', () => {
  const universe = { schema: 'atlas.universe.v1', completeEligibleUniverse: true,
    knownAt: T0, provenance: fixtureProvenance('membership', T0),
    instruments: [
      { id: 'THEN_LISTED', availableAt: T0, effectiveFrom: T0, effectiveTo: T0 + 10 * MINUTE },
      { id: 'FUTURE_IPO', availableAt: T0, effectiveFrom: T0 + 5 * MINUTE, effectiveTo: null },
    ] };
  assert.deepEqual(universeAt(universe, T0 + MINUTE).instruments.map(row => row.id), ['THEN_LISTED']);
  universe.knownAt = T0 + 3 * MINUTE;
  assert.throws(() => universeAt(universe, T0 + MINUTE), { code: 'FUTURE_UNIVERSE' });
});
test('observed quotes are separate from historical candles and executable fills', () => {
  const quote = { schema: 'atlas.quote.v1', kind: 'OBSERVED_MARKET_QUOTE',
    sourceAt: T0, observedAt: T0 + 1000, price: 100, currency: 'INR', symbol: 'FIXTURE' };
  assert.equal(validateQuote(quote, { now: T0 + 2000 }).executable, false);
  assert.throws(() => validateQuote(quote, { now: T0 + 100000 }), { code: 'STALE_OR_FUTURE_QUOTE' });
});
test('source references cannot persist access tokens in report URLs', () => {
  const data = makeDataset(); data.provenance.sourceUrl = 'https://example.org/candles?access_token=fixture-secret';
  fails(data, 'SENSITIVE_SOURCE_URL');
});
test('an action review cannot certify a period after its retrieval date', () => {
  const data = makeDataset({ assetClass: 'NSE_EQUITY' });
  data.corporateActions.reviewedThrough = data.provenance.retrievedAt + MINUTE;
  fails(data, 'FUTURE_CORPORATE_ACTION_REVIEW');
});
