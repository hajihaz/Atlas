import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { NSE_SESSIONS, sessionTime } from '../../research/advanced/calendar.mjs';
import { normalizeCandles, normalizeUpstoxMaster, instant, grid, json, csv, coverage, safeUrl } from '../../research/nse-certification/normalize.mjs';

const session = '2026-09-18', time = sessionTime(session, 9, 15), stamp = new Date(time).toISOString();
const options = { format: 'UPSTOX_V3', session, instrumentId: 'NSE_EQ|INE848E01016', symbol: 'FIXTURE',
  volumeUnit: 'SHARES', priceBasis: 'RAW_UNADJUSTED' };
function up(rows) { return Buffer.from(JSON.stringify({ status: 'success', data: { candles: rows } })); }
const row = () => [stamp, 100, 101, 99, 100.5, 100, 0];
test('bounded calendar has exactly nine September and eleven October sessions', () => {
  assert.equal(NSE_SESSIONS.length, 20); assert.equal(NSE_SESSIONS[0], '2026-09-18');
  assert.equal(NSE_SESSIONS.at(-1), '2026-10-16'); assert(!NSE_SESSIONS.includes('2026-10-02'));
  assert.equal(NSE_SESSIONS.filter(d => d.startsWith('2026-09')).length, 9);
  assert.equal(grid(session).length, 375); assert.equal(grid(session, 15).at(-1), sessionTime(session, 9, 29));
});
test('explicit timezone is mandatory, IST equals UTC, impossible dates fail', () => {
  assert.equal(instant('2026-09-18T09:15:00+05:30'), instant(stamp));
  for (const value of ['2026-09-18 09:15', '2026-02-30T09:15:00Z', 1790000000000, 'bad'])
    assert.throws(() => instant(value));
});
test('sub-millisecond publication timestamps are conservatively rounded upward', () => {
  assert.equal(instant('2026-09-18T09:30:00.000001+05:30'), instant('2026-09-18T09:30:00+05:30') + 1);
  assert.equal(instant('2026-09-18T09:30:00.000000+05:30'), instant('2026-09-18T09:30:00+05:30'));
});
test('fractional or end-labelled candle starts cannot round into a valid minute', () => {
  for (const value of ['2026-09-18T09:14:59.999999+05:30', '2026-09-18T09:15:00.000001+05:30']) {
    const r = row(); r[0] = value;
    assert.throws(() => normalizeCandles(up([r]), options), /MISALIGNED_MINUTE/);
  }
});
test('JSON rejects duplicate and unsafe object keys at all depths', () => {
  for (const value of ['{"a":1,"a":2}', '{"nested":[{"x":1,"x":2}]}', '{"__proto__":{}}'])
    assert.throws(() => json(value), /DUPLICATE_OR_UNSAFE/);
  assert.deepEqual(json('{"a":[1,true,null,"x"]}'), { a: [1, true, null, 'x'] });
});
test('Upstox descending order is normalized, exact zero volume is preserved', () => {
  const first = row(), second = row(); second[0] = new Date(time + 60000).toISOString(); first[5] = 0;
  const data = normalizeCandles(up([second, first]), options);
  assert.equal(data.rows[0].time, time); assert.equal(data.rows[0].volume, 0);
  assert.equal(coverage(data).observed, 2); assert.equal(coverage(data).missing.length, 373);
});
test('missing minutes remain gaps; none are interpolated', () => {
  const rows = grid(session).filter((_, i) => i !== 14).map(t => [new Date(t).toISOString(), 100, 101, 99, 100, 1, 0]);
  const data = normalizeCandles(up(rows), options);
  assert.equal(data.rows.length, 374); assert.equal(coverage(data).complete, false);
  assert(coverage(data).missing.includes(new Date(time + 14 * 60000).toISOString()));
});
for (const [name, modify] of [
  ['duplicate', r => [r, r]], ['fractional shares', r => { r[5] = 0.5; return [r]; }],
  ['negative shares', r => { r[5] = -1; return [r]; }], ['numeric string', r => { r[1] = '100'; return [r]; }],
  ['null price', r => { r[2] = null; return [r]; }], ['OHLC', r => { r[3] = 101; return [r]; }],
  ['end-labelled :59', r => { r[0] = '2026-09-18T09:15:59+05:30'; return [r]; }],
  ['preopen auction', r => { r[0] = '2026-09-18T09:14:00+05:30'; return [r]; }],
  ['wrong date', r => { r[0] = '2026-10-16T09:15:00+05:30'; return [r]; }],
  ['wrong shape', r => [r.slice(0, 6)]],
]) test(`Upstox adversarial ${name} fails`, () => assert.throws(() => normalizeCandles(up(modify(row())), options)));
test('provider error and turnover volume semantics are rejected', () => {
  assert.throws(() => normalizeCandles(Buffer.from('{"status":"error"}'), options));
  assert.throws(() => normalizeCandles(up([row()]), { ...options, volumeUnit: 'TURNOVER_INR' }));
});
test('FYERS adapter uses explicit epoch seconds and rejects milliseconds', () => {
  const raw = seconds => Buffer.from(JSON.stringify({ s: 'ok', candles: [[seconds, 100, 101, 99, 100, 100]] }));
  assert.equal(normalizeCandles(raw(time / 1000), { ...options, format: 'FYERS_V3' }).rows[0].time, time);
  assert.throws(() => normalizeCandles(raw(time), { ...options, format: 'FYERS_V3' }));
});
test('CSV handles BOM, CRLF and quotes; rejects malformed shape and formulas', () => {
  const header = 'symbol,timestamp,open,high,low,close,volume\r\n';
  const raw = '\uFEFF' + header + `"FIXTURE",${stamp},100,101,99,100.5,0\r\n`;
  assert.equal(normalizeCandles(raw, { ...options, format: 'ATLAS_CSV' }).rows[0].volume, 0);
  for (const bad of [header + `OTHER,${stamp},100,101,99,100,1`, header + `FIXTURE,${stamp},=100,101,99,100,1`,
    'a,a\n1,2', 'a,b\n"unterminated,1', 'a,b\n"a"x,1', 'a,b\n1']) assert.throws(() => {
    if (bad.startsWith('symbol')) normalizeCandles(bad, { ...options, format: 'ATLAS_CSV' }); else csv(bad);
  });
  assert.deepEqual(csv('a,b\n"x,y","a""b"'), [{ a: 'x,y', b: 'a"b' }]);
});
test('BOD/MIS normalizer joins stable identities and requires independently dated NSE series', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ instrument_key: `NSE_EQ|INE${String(i).padStart(9, '0')}`,
    isin: `INE${String(i).padStart(9, '0')}`, segment: 'NSE_EQ', instrument_type: 'EQ', security_type: 'NORMAL',
    trading_symbol: 'FIXTURE_' + i, lot_size: 1, tick_size: 5 }));
  const config = { session, publishedAt: '2026-09-18T08:00:00+05:30', retrievedAt: '2026-10-23T00:00:00Z',
    eligibilityIds: rows.map(r => r.instrument_key), suspendedIds: [rows[11].instrument_key],
    tickSizeUnit: 'PAISE',
    seriesByIsin: Object.fromEntries(rows.map(r => [r.isin, 'EQ'])) };
  const raw = gzipSync(Buffer.from(JSON.stringify(rows))), result = normalizeUpstoxMaster(raw, config);
  assert.equal(result.length, 11); assert.equal(result[0].priceTickINR, 0.05);
  assert(!result.some(r => r.id === rows[11].instrument_key));
  assert.throws(() => normalizeUpstoxMaster(raw, { ...config, seriesByIsin: undefined }));
  assert.throws(() => normalizeUpstoxMaster(raw, { ...config, tickSizeUnit: undefined }));
  assert.throws(() => normalizeUpstoxMaster(raw, { ...config, publishedAt: '2026-10-23T08:00:00+05:30' }));
  assert.throws(() => normalizeUpstoxMaster(raw, { ...config, eligibilityIds: config.eligibilityIds.slice(0, 9) }));
});
test('source URLs reject embedded credentials and credential-shaped query parameters', () => {
  for (const url of ['http://example.org/x', 'https://u:p@example.org/x', 'https://example.org/x?access_token=secret'])
    assert.throws(() => safeUrl(url));
  assert.equal(safeUrl('https://example.org/x'), 'https://example.org/x');
});
