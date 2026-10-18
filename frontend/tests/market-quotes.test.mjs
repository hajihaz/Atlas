import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { getPublicSnapshot, normalizeKraken, unconnectedStocks } from '../api/market-quotes.js';

const good = { error: [], result: { XXBTZUSD: { c: ['69420.1'] }, XETHZUSD: { c: ['4032.6'] } } };

test('only fixed public tickers normalize to read-only observations with unknown age', () => {
  const rows = normalizeKraken(good, '2026-10-18T00:00:00Z');
  assert.deepEqual(rows.map(row => row.symbol), ['BTC/USD', 'ETH/USD']);
  assert.equal(rows[0].price, 69420.1);
  assert.equal(rows[0].observedAt, null);
  assert.equal(rows[0].paperEligible, false);
  assert.equal(rows[0].status, 'observation_time_unverified');
});

test('malformed or missing provider prices never become executable data', () => {
  assert.throws(() => normalizeKraken({error: ['unknown']}, '2026-10-18T00:00:00Z'));
  const rows = normalizeKraken({error: [], result: {XXBTZUSD: {c: ['Infinity']}}}, '2026-10-18T00:00:00Z');
  assert.equal(rows[0].price, null);
  assert.equal(rows[1].price, null);
  assert.ok(rows.every(row => !row.paperEligible));
});

test('stock feed stays private and unavailable with no fake quote', () => {
  const rows = unconnectedStocks();
  assert.ok(rows.length >= 1);
  assert.ok(rows.every(row => row.price === null && row.status === 'private_connection_required'));
});

test('upstream failure returns an honest disconnected response without retry storm', async () => {
  let calls = 0;
  const result = await getPublicSnapshot(async () => { calls++; throw new Error('connection refused'); }, 999999999999);
  assert.equal(calls, 1);
  assert.equal(result.providerStatus, 'unavailable');
  assert.equal(result.liveOrdersEnabled, false);
  assert.equal(result.paperExecutionEnabled, false);
  assert.ok(result.crypto.every(row => row.price === null));
});

test('successful provider snapshot is cached for short interval', async () => {
  let calls = 0;
  const provider = async url => {
    calls++;
    assert.ok(url.startsWith('https://api.kraken.com/0/public/Ticker?'));
    return {ok: true, json: async () => good};
  };
  const first = await getPublicSnapshot(provider, 1999999999999);
  const second = await getPublicSnapshot(provider, 1999999999999 + 1000);
  assert.equal(first.providerStatus, 'public_observation');
  assert.equal(second, first);
  assert.equal(calls, 1);
});

test('server endpoint rejects all order or mutation methods', async () => {
  let status = 0;
  const headers = {};
  const req = {method: 'POST', body: {action: 'buy', quantity: 100}};
  const res = {
    setHeader: (key, value) => {headers[key] = value;},
    status: code => {status = code; return res;},
    json: value => value,
  };
  const payload = await handler(req, res);
  assert.equal(status, 405);
  assert.equal(payload.error, 'method_not_allowed');
  assert.equal(headers.Allow, 'GET');
});
