import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { planAcquisition } from '../../research/nse-certification/planner.mjs';

const cli = resolve('research/nse-certification/cli.mjs');
function temporary(t) { const dir = mkdtempSync(join(tmpdir(), 'atlas-nse-cli-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; }
test('missing CLI inputs fail without a fixture or financial fallback', t => {
  const dir = temporary(t), output = join(dir, 'results');
  for (const args of [[], ['audit'], ['replay', '--root', dir, '--out', output]]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2); assert(!existsSync(output)); assert(!result.stdout.includes('netPnl'));
  }
});
test('explicit empty evidence yields twenty null days, two null months and no fake trades', t => {
  const dir = temporary(t), manifest = { schema: 'atlas.nse-bundle.v1', kind: 'HISTORICAL_MARKET', producer: 'TEST_EMPTY_EVIDENCE', files: [], sessions: [] };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  for (const command of ['audit', 'replay']) {
    const out = join(dir, command), args = [cli, command, '--root', dir, '--manifest', 'manifest.json', '--out', out];
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(result.status, 3, result.stderr); const report = JSON.parse(readFileSync(join(out, 'report.json')));
    assert.equal(report.realSessionsCertified, 0); assert.equal(report.daily.length, 20);
    assert.deepEqual(report.months.map(m => m.expectedSessions), [9, 11]);
    assert(report.daily.every(d => d.realizedPnlINR === null && d.unrealizedPnlINR === null && d.trades === null));
    assert.equal(readFileSync(join(out, 'trades.csv'), 'utf8').match(/UNVERIFIED/g).length, 20);
    assert(!readFileSync(join(out, 'trades.csv'), 'utf8').includes('HYPOTHETICAL'));
    const original = readFileSync(join(out, 'report.json'));
    assert.equal(spawnSync(process.execPath, args, { encoding: 'utf8' }).status, 2);
    assert.deepEqual(readFileSync(join(out, 'report.json')), original);
  }
});
test('CLI rejects unknown/duplicate arguments and unpinned external reviews', t => {
  const dir = temporary(t);
  for (const args of [['audit', '--unknown', 'x'], ['audit', '--root', dir, '--root', dir],
    ['audit', '--root', dir, '--manifest', 'x', '--out', join(dir, 'o'), '--review', 'r']])
    assert.equal(spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' }).status, 2);
});
test('future acquisition plans respect shared budgets and socket caps without sending requests', () => {
  const upstox = planAcquisition({ provider: 'UPSTOX', instruments: 2500 });
  assert.equal(upstox.historicalRequests, 5000); assert.equal(upstox.conservativeSustainableMinutes, 75);
  assert.equal(upstox.minimumQuotaDays, null); assert.equal(upstox.fullMarketSocketFitsSingleMode, false);
  const fyers = planAcquisition({ provider: 'FYERS_STANDARD', instruments: 2500 });
  assert.equal(fyers.historicalRequests, 2500); assert.equal(fyers.conservativeSustainableMinutes, 50);
  assert.equal(fyers.minimumQuotaDays, 1); assert.equal(fyers.fullMarketSocketFitsSingleMode, false);
  assert.equal(fyers.fullMarketMinuteHistoryPollingFits, false);
  assert.equal(fyers.expectedStockMinuteRows, 18750000);
  for (const p of [upstox, fyers]) { assert.equal(p.requestsSent, 0); assert.equal(p.additionalSpendINR, 0); assert.equal(p.observedEligibleStockCount, null); }
  for (const invalid of [{ provider: 'UNKNOWN', instruments: 12 }, { provider: 'UPSTOX', instruments: 2500.5 },
    { provider: 'FYERS_STANDARD', instruments: 9 }]) assert.throws(() => planAcquisition(invalid));
});
