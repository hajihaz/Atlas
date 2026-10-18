import assert from 'node:assert/strict';
import test from 'node:test';
import handler, { normalizeClosedCandles, getClosedCandleSnapshot } from '../api/closed-candles.js';

const now = Date.parse('2026-10-18T08:00:30Z');
const stamp = (iso) => Math.floor(Date.parse(iso) / 1000);
const candle = (iso, close = '70010') =>
  [stamp(iso), '70000', '70100', '69900', close, '70020', '5.2', 42];
const fixture = (older = candle('2026-10-18T07:58:00Z'), final = candle('2026-10-18T07:59:00Z')) => ({
  error: [], result: {
    XXBTZUSD: [older, final, candle('2026-10-18T08:00:00Z', '990000')],
    XETHZUSD: [
      [stamp('2026-10-18T07:58:00Z'), '3000', '3050', '2970', '3020', '3010', '2', 9],
      [stamp('2026-10-18T07:59:00Z'), '3000', '3050', '2970', '3021', '3010', '2', 9],
      [stamp('2026-10-18T08:00:00Z'), '3000', '3050', '2970', '99000', '3010', '2', 9],
    ],
  },
});

test('latest uncommitted candle cannot leak into a closed-bar price', () => {
  const rows = normalizeClosedCandles(fixture(), now);
  assert.equal(rows[0].close, 70010);
  assert.equal(rows[0].observedAt, '2026-10-18T08:00:00.000Z');
  assert.equal(rows[0].status, 'recent_closed_candle');
  assert.equal(rows[0].paperEligible, false);
  assert.equal(rows[1].close, 3021);
  assert.ok(rows.every(row => row.paperEligible === false));
});
test('stale but plausible historical prices are visibly labelled stale', () => {
  const data = fixture(candle('2026-10-18T07:30:00Z'), candle('2026-10-18T07:31:00Z'));
  const rows = normalizeClosedCandles(data, now);
  assert.equal(rows[0].status, 'stale');
  assert.ok(rows[0].ageSeconds > 600);
});
test('a bar from the future fails closed', () => {
  const data = fixture(candle('2026-10-18T08:02:00Z'), candle('2026-10-18T08:03:00Z'));
  assert.equal(normalizeClosedCandles(data, now)[0].status, 'future_candle');
});
test('invalid high/low, missing bar, and impossible prices are rejected', () => {
  for (const price of ['NaN', 'Infinity', '-1', '0']) {
    const data = fixture(undefined, candle('2026-10-18T07:59:00Z', price));
    assert.equal(normalizeClosedCandles(data, now)[0].status, 'invalid');
  }
  const data = fixture();
  data.result.XXBTZUSD = [candle('2026-10-18T08:00:00Z')];
  assert.equal(normalizeClosedCandles(data, now)[0].status, 'unavailable');
});
test('out-of-order / duplicate historical bar timestamps are rejected', () => {
  const data = fixture(candle('2026-10-18T07:59:00Z'));
  assert.equal(normalizeClosedCandles(data, now)[0].status, 'invalid');
});
test('upstream errors provide no invented closed candles', async () => {
  let requests = 0;
  const snapshot = await getClosedCandleSnapshot(async () => {
    requests += 1;
    throw Error('provider down');
  }, now - 15000);
  assert.equal(requests, 2);
  assert.ok(snapshot.bars.every(bar => bar.close === null));
  assert.equal(snapshot.paperExecutionEnabled, false);
  assert.equal(snapshot.liveOrdersEnabled, false);
});
test('public source can only fetch its fixed Kraken OHLC URL', async () => {
  let calls = 0;
  const snapshot = await getClosedCandleSnapshot(async (url) => {
    calls++;
    assert.ok([
      'https://api.kraken.com/0/public/OHLC?interval=1&pair=XBTUSD',
      'https://api.kraken.com/0/public/OHLC?interval=1&pair=ETHUSD',
    ].includes(url));
    return { ok: true, json: async () => fixture() };
  }, now);
  assert.equal(calls, 2);
  assert.equal(snapshot.bars[0].status, 'recent_closed_candle');
  const cached = await getClosedCandleSnapshot(async () => { throw Error('cache unexpectedly missed'); }, now + 1000);
  assert.equal(cached, snapshot);
});
test('HTTP mutation methods cannot submit orders', async () => {
  const headers = {};
  const response = {
    setHeader: (k, v) => { headers[k] = v; },
    status(code) { this.code = code; return this; },
    json(value) { return value; },
  };
  const data = await handler({ method: 'POST', body: { order: 'BUY' } }, response);
  assert.equal(response.code, 405);
  assert.equal(headers.Allow, 'GET');
  assert.equal(data.error, 'method_not_allowed');
});
