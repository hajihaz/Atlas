import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalApiServer } from '../server.js';

test('local API adapter serves allowlisted read-only handlers and no arbitrary files', async t => {
  const server = createLocalApiServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const missing = await fetch(`${base}/api/AGENTS.md`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'not_found' });

  const method = await fetch(`${base}/api/live-feed`, { method: 'POST' });
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'GET');

  const invalid = await fetch(`${base}/api/strategy-lab?symbol=UNSUPPORTED`);
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: 'unsupported_market_or_period' });
});
