// Artificial engineering inputs. Never authentic NSE observations or performance.
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sessionTime } from '../../research/advanced/calendar.mjs';
import { sha256, objectHash } from '../../research/nse-certification/normalize.mjs';
import { openBundle, POLICY, REVIEW_CHECKS } from '../../research/nse-certification/certify.mjs';

export const iso = t => new Date(t).toISOString();
export function makeFixtureBundle(t, { session = '2026-09-18', count = 12 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-nse-fixture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const start = sessionTime(session, 9, 15), preopen = iso(start - 60000);
  const manifest = { schema: 'atlas.nse-bundle.v1', kind: 'SYNTHETIC_FIXTURE',
    producer: 'SYNTHETIC_ENGINEERING_FIXTURE', files: [], sessions: [] };
  function add(id, role, data, extra = {}) {
    const raw = JSON.stringify(data), path = id + '.json';
    writeFileSync(join(root, path), raw);
    const file = { id, role, path, sha256: sha256(raw), kind: 'SYNTHETIC_FIXTURE',
      sourceId: 'self-contained-fixture', sourceUrl: 'https://example.invalid/atlas-nse-fixture',
      retrievedAt: '2026-10-23T00:00:00Z', publishedAt: iso(start - 900000), ...extra };
    manifest.files.push(file); return file;
  }
  function change(id, fn) {
    const file = manifest.files.find(f => f.id === id), data = JSON.parse(readFileSync(join(root, file.path)));
    const replacement = fn(data) ?? data, raw = JSON.stringify(replacement);
    writeFileSync(join(root, file.path), raw); file.sha256 = sha256(raw); return replacement;
  }
  function save() { writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest)); }
  const members = Array.from({ length: count }, (_, i) => ({
    id: `NSE_EQ|INE${String(i).padStart(9, '0')}`, isin: `INE${String(i).padStart(9, '0')}`,
    symbol: `FIXTURE_${String(i).padStart(2, '0')}`, series: 'EQ', lotSize: 1, priceTickINR: 0.05,
    knownAt: preopen, effectiveFrom: iso(start - 86400000), effectiveTo: iso(start + 86400000), shortEligible: false }));
  const original = add('original-reference', 'ORIGINAL', { label: 'SYNTHETIC_NOT_EXCHANGE_DATA', members });
  for (const role of ['MASTER', 'ELIGIBILITY', 'SUSPENSIONS', 'IDENTITY']) add(role.toLowerCase(), role, {
    schema: 'atlas.nse-reference-evidence.v1', session, scope: POLICY, originalFileId: original.id,
    instrumentIds: role === 'SUSPENSIONS' ? [] : members.map(m => m.id) });
  add('universe', 'UNIVERSE', { schema: 'atlas.nse-universe.v1', session, exchange: 'NSE', segment: 'CASH',
    scope: POLICY, selection: 'PREOPEN_FULL_ELIGIBLE_UNIVERSE', knownAt: preopen,
    effectiveAt: iso(start - 86400000), members,
    evidence: { master: 'master', eligibility: 'eligibility', suspensions: 'suspensions', identity: 'identity' } });
  const candleFileIds = [], dataSets = [];
  for (let i = 0; i <= count; i++) {
    const index = i === count, member = index ? { id: 'NSE_INDEX|Nifty 50', symbol: 'NIFTY50' } : members[i];
    const rows = Array.from({ length: index ? 15 : 375 }, (_, minute) => {
      const open = index ? 100 : 100 + i + minute * 0.002;
      const close = index ? 100 + minute * 0.02 : open + 0.01;
      return { time: iso(start + minute * 60000), open, high: Math.max(open, close) + 0.1,
        low: open - 0.1, close, volume: index ? 0 : 10000 + (count - i) * 100 };
    });
    const id = index ? 'index' : 'candles-' + i;
    add(id, 'CANDLES', { schema: 'atlas.nse-candles.v1', kind: 'SYNTHETIC_FIXTURE',
      instrumentId: member.id, session, rows }, { session, instrumentId: member.id,
      format: 'NORMALIZED_V1', volumeUnit: index ? 'INDEX' : 'SHARES', priceBasis: 'RAW_UNADJUSTED' });
    if (!index) candleFileIds.push(id);
    dataSets.push({ instrumentId: member.id, rows });
  }
  add('actions-original', 'ORIGINAL', { label: 'SYNTHETIC_NO_ACTIONS' });
  add('actions', 'ACTIONS', { schema: 'atlas.nse-actions.v1', session, priceBasis: 'RAW_UNADJUSTED',
    reviewedFrom: iso(start), reviewedThrough: iso(sessionTime(session, 15, 30)), originalFileId: 'actions-original',
    instruments: dataSets.map(d => d.instrumentId), events: [] });
  const observationOriginal = add('observations-original', 'ORIGINAL', { label: 'SYNTHETIC_OBSERVATIONS', dataSets },
    { publishedAt: iso(start + 60000) });
  const observations = dataSets.flatMap(d => d.rows.map(row => {
    const time = Date.parse(row.time), hash = objectHash({ ...row, time });
    return { instrumentId: d.instrumentId, minute: row.time, availableAt: iso(time + 60000),
      observedAt: iso(time + 60000), candleHash: hash, evidenceFileId: 'observation-proofs',
      originalFileId: observationOriginal.id, originalSha256: observationOriginal.sha256 };
  }));
  add('observation-proofs', 'PUBLICATION', { schema: 'atlas.nse-observation-receipts.v1', observations },
    { publishedAt: iso(start + 60000) });
  add('publication', 'PUBLICATION', { schema: 'atlas.nse-publication.v1', session,
    mode: 'RECORDED_OBSERVATION', observations }, { publishedAt: iso(start + 60000) });
  add('fixture-rights', 'RIGHTS', { label: 'TEST_ONLY_NOT_A_MARKET_DATA_GRANT' });
  const day = { session, universeFileId: 'universe', candleFileIds, indexFileId: 'index',
    actionsFileId: 'actions', publicationFileId: 'publication', rightsFileIds: ['fixture-rights'] };
  manifest.sessions.push(day); save();
  function open() { save(); return openBundle(root, 'manifest.json'); }
  function review() {
    const bundle = open();
    const review = { schema: 'atlas.nse-independent-review.v1', reviewer: 'INDEPENDENT_TEST_REVIEWER',
      reviewedAt: '2026-10-23T01:00:00Z', manifestSha256: bundle.manifestSha256, decision: 'APPROVED',
      sessions: [session], checks: Object.fromEntries(REVIEW_CHECKS.map(k => [k, 'VERIFIED'])),
      permissions: { privateOfflineResearch: 'GRANTED', derivedPerformancePublication: 'GRANTED', rawRedistribution: false },
      grants: [{ sourceId: 'self-contained-fixture', evidenceFileId: 'fixture-rights', privateOfflineResearch: 'GRANTED',
        derivedPerformancePublication: 'GRANTED', additionalCostINR: 0, validFrom: '2026-10-19T00:00:00Z',
        validThrough: '2026-12-31T23:59:59Z', dataFrom: '2026-01-01T00:00:00Z', dataThrough: '2026-12-31T23:59:59Z' }] };
    const reviewRaw = Buffer.from(JSON.stringify(review));
    return { review, reviewRaw, expectedReviewSha256: sha256(reviewRaw) };
  }
  return { root, manifest, day, members, add, change, save, open, review };
}
