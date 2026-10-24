import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { objectHash, csv, instant } from '../../research/nse-certification/normalize.mjs';

const base = 'docs/research/nse-certification/';
const read = name => JSON.parse(readFileSync(base + name, 'utf8'));
test('committed source inventory keeps archive metadata distinct from certified minute observations', () => {
  const findings = read('source-findings-pinned.json');
  assert.equal(findings.realSessionsCertified, 0); assert.equal(findings.rawMarketArchivesDownloaded, 0);
  assert.equal(findings.olo.immutableCommitTreeAndDirectoryCrosscheck, 'PASS');
  assert.equal(findings.olo.requestedStockArchiveNamesPresent, 5);
  assert.equal(findings.olo.daily.length, 20); assert.equal(findings.olo.treeTruncated, false);
  assert(findings.olo.daily.every(d => d.indexArchive === null));
  assert(findings.olo.daily.every(d => !d.certified && (d.stockArchive === null
    || d.stockArchive.downloadedArchiveSha256 === null && d.stockArchive.minuteRowsInspected === false)));
  const { findingsSha256, ...body } = findings; assert.equal(findingsSha256, objectHash(body));
});
test('every source receipt has a unique ID, actual status, source URL, UTC time and byte hash', () => {
  const records = ['source-receipts.json', 'followup-receipts.json', 'pinned-receipts.json', 'calendar-receipts.json']
    .flatMap(name => { const file = read(name); assert.equal(file.completed, file.requested); return file.receipts; });
  assert.equal(records.length, read('source-findings-pinned.json').sourceReceiptsVerified);
  assert.equal(new Set(records.map(r => r.id)).size, records.length);
  for (const r of records) {
    assert.equal(r.method, 'GET'); assert.equal(r.authentication, 'NONE');
    assert(/^[a-f0-9]{64}$/.test(r.sha256)); assert(Number.isInteger(r.bytes) && r.bytes > 0);
    assert(Number.isInteger(r.status) && r.status >= 200 && r.status <= 599);
    assert(r.url.startsWith('https://')); assert(instant(r.retrieved_at) >= instant(r.requested_at));
    assert(!Object.keys(r.headers).some(k => /cookie|authorization/i.test(k)));
  }
});
test('inspectable exports preserve null/blank unverified financial results for all twenty dates', () => {
  const report = read('results/report.json'), { reportHash, ...body } = report;
  assert.equal(objectHash(body), reportHash); assert.equal(report.realSessionsCertified, 0);
  assert.equal(report.historicalNetPnlINR, null); assert.equal(report.frequentlySelectedStocks, null);
  assert.equal(report.daily.length, 20);
  const daily = csv(readFileSync(base + 'results/daily.csv'));
  assert.equal(daily.length, 20);
  for (const d of daily) {
    assert.equal(d.valueStatus, 'UNVERIFIED');
    for (const key of ['realizedPnlINR', 'unrealizedPnlINR', 'netPnlINR', 'returnPct', 'maxDrawdownPct']) assert.equal(d[key], '');
  }
  assert.deepEqual(report.months.map(m => [m.expectedSessions, m.certifiedSessions, m.netPnlINR]), [[9, 0, null], [11, 0, null]]);
  assert.equal(csv(readFileSync(base + 'results/trades.csv')).length, 20);
});
test('contract schema envelopes parse with explicit review and manifest definitions', () => {
  const schema = read('contracts.schema.json');
  assert.equal(schema.$defs.bundle.properties.schema.const, 'atlas.nse-bundle.v1');
  assert.equal(schema.$defs.review.properties.schema.const, 'atlas.nse-independent-review.v1');
  assert(schema.$defs.review.required.includes('manifestSha256'));
});
