import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixtureBundle, iso } from './fixtures.mjs';
import { sha256, objectHash, grid } from '../../research/nse-certification/normalize.mjs';
import { auditSession, auditCampaign, rankOpening, independentReview, openBundle } from '../../research/nse-certification/certify.mjs';
import { toAdvancedInput, dailyFinancials, replayCertified } from '../../research/nse-certification/replay.mjs';
import { selectScalpStorm, runScalpStormDay } from '../../research/advanced/scalpstorm.mjs';

test('complete artificial engineering input passes technical gates but certifies zero real sessions', t => {
  const f = makeFixtureBundle(t), bundle = f.open(), day = auditSession(bundle, f.day);
  assert.equal(day.technicalPass, true, JSON.stringify(day.blockers));
  assert.equal(day.ranking.length, 12); assert.equal(day.ranking[0].symbol, 'FIXTURE_00');
  const report = auditCampaign(bundle, f.review()).report;
  assert.equal(report.technicalSessionsPassed, 1); assert.equal(report.realSessionsCertified, 0);
  assert(report.daily.every(d => d.netPnlINR === null && d.trades === null && d.selected === null));
  assert(report.months.every(m => m.netPnlINR === null && m.frequentlySelectedStocks === null));
  assert.equal(report.historicalNetPnlINR, null); assert.equal(report.realOrdersPlaced, 0);
});
test('independent ranking agrees with upstream engine and an imperative opening-volume oracle', t => {
  const f = makeFixtureBundle(t), b = f.open(), audited = auditSession(b, f.day);
  const oracle = audited.datasets.map(d => ({ symbol: d.symbol, volume: d.rows.slice(0, 15).reduce((s, r) => s + r.volume, 0) }))
    .sort((a, b) => b.volume - a.volume || (a.symbol < b.symbol ? -1 : 1));
  assert.deepEqual(audited.ranking.map(r => [r.symbol, r.cumulativeShareVolume]), oracle.map(r => [r.symbol, r.volume]));
  const advanced = selectScalpStorm(toAdvancedInput(b, f.day, audited));
  assert.deepEqual(advanced.selected.map(r => r.id), audited.ranking.slice(0, 10).map(r => r.symbol));
});
test('rank uses only first fifteen completed bars, with stable symbol ties and input-order invariance', t => {
  const f = makeFixtureBundle(t), a = auditSession(f.open(), f.day);
  for (const dataset of a.datasets) for (const row of dataset.rows) row.volume = row.time < grid(f.day.session, 15).at(-1) + 60000 ? 10 : 1e12;
  const ranked = rankOpening(f.day.session, [...a.members].reverse(), [...a.datasets].reverse(), a.publications);
  assert.deepEqual(ranked.map(r => r.symbol), [...f.members].map(m => m.symbol).sort());
  assert(ranked.every(r => r.cumulativeShareVolume === 150));
  a.datasets[11].rows[300].volume = 0;
  assert.deepEqual(rankOpening(f.day.session, a.members, a.datasets, a.publications), ranked);
});
test('ranking rejects overflow, missing candidates, duplicate candidate data and late observations', t => {
  const f = makeFixtureBundle(t), a = auditSession(f.open(), f.day);
  assert.throws(() => rankOpening(f.day.session, a.members, a.datasets.slice(1), a.publications));
  assert.throws(() => rankOpening(f.day.session, a.members, [...a.datasets.slice(1), a.datasets[1]], a.publications));
  for (const row of a.datasets[0].rows.slice(0, 15)) row.volume = Number.MAX_SAFE_INTEGER;
  assert.throws(() => rankOpening(f.day.session, a.members, a.datasets, a.publications), /OVERFLOW/);
});
for (const [name, mutate, code] of [
  ['retrospective top-ten', f => f.change('universe', u => { u.selection = 'RETROSPECTIVE_TOP_TEN'; }), 'FULL_PIT_UNIVERSE_REQUIRED'],
  ['omitted eligible stocks', f => { f.change('universe', u => { u.members = u.members.slice(0, 10); }); f.day.candleFileIds = f.day.candleFileIds.slice(0, 10); }, 'ELIGIBLE_MEMBER_OMISSION'],
  ['snapshot at open', f => f.change('universe', u => { u.knownAt = f.day.session + 'T09:15:00+05:30'; }), 'RETROSPECTIVE_UNIVERSE'],
  ['today master relabelled', f => { f.manifest.files.find(r => r.id === 'master').publishedAt = '2026-10-23T00:00:00Z'; }, 'UNIVERSE_SOURCE_NOT_PREOPEN'],
  ['suspended stock', f => f.change('suspensions', u => { u.instrumentIds = [f.members[0].id]; }), 'ELIGIBLE_MEMBER_OMISSION'],
  ['same symbol reused', f => f.change('universe', u => { u.members[1].symbol = u.members[0].symbol; }), 'DUPLICATE_OR_INVALID_MEMBER'],
  ['one missing minute', f => f.change('candles-0', d => { d.rows.splice(14, 1); }), 'FULL_SESSION_MINUTE_GAP'],
  ['back-adjusted candles', f => { f.manifest.files.find(r => r.id === 'candles-0').priceBasis = 'BACK_ADJUSTED'; }, 'BACK_ADJUSTED_OR_UNKNOWN_PRICE_BASIS'],
  ['incomplete action review', f => f.change('actions', a => { a.reviewedThrough = f.day.session + 'T15:00:00+05:30'; }), 'ACTION_REVIEW_INCOMPLETE'],
  ['intraday split', f => f.change('actions', a => { a.events.push({ instrumentId: f.members[0].id, type: 'SPLIT',
    effectiveAt: f.day.session + 'T10:00:00+05:30', knownAt: f.day.session + 'T09:00:00+05:30' }); }), 'INTRADAY_ACTION_UNRESOLVED'],
  ['late action knowledge', f => f.change('actions', a => { a.events.push({ instrumentId: f.members[0].id, type: 'DIVIDEND',
    effectiveAt: f.day.session + 'T00:00:00+05:30', knownAt: f.day.session + 'T10:00:00+05:30' }); }), 'FUTURE_ACTION_KNOWLEDGE'],
  ['missing publication', f => f.change('publication', p => { p.observations.splice(0, 1); }), 'MISSING_FULL_SESSION_PUBLICATION_RECORD'],
  ['late last opening bar', f => {
    for (const id of ['publication', 'observation-proofs']) f.change(id, p => {
      p.observations[14].availableAt = f.day.session + 'T09:30:01+05:30';
      p.observations[14].observedAt = f.day.session + 'T09:30:01+05:30'; });
  }, 'OPENING_BAR_NOT_KNOWN_AT_DECISION'],
  ['bar-close assumption', f => f.change('publication', p => { p.mode = 'ASSUMED_BAR_CLOSE'; }), 'RECORDED_PUBLICATION_REQUIRED'],
  ['premature full candle', f => f.change('publication', p => { p.observations[0].availableAt = p.observations[0].minute; }), 'PREMATURE_PUBLICATION'],
  ['changed price after observation', f => f.change('candles-0', d => { d.rows[0].close += 0.01; }), 'PUBLICATION_CANDLE_HASH_MISMATCH'],
  ['missing index', f => { f.day.indexFileId = 'missing-index'; }, 'MISSING_OR_WRONG_EVIDENCE_ROLE'],
  ['missing rights', f => { f.day.rightsFileIds = []; }, 'WRITTEN_RIGHTS_EVIDENCE_REQUIRED'],
]) test(`certification adversarial ${name} fails closed`, t => {
  const f = makeFixtureBundle(t); mutate(f); const result = auditSession(f.open(), f.day);
  assert.equal(result.technicalPass, false); assert(result.blockers.some(b => b.code === code), JSON.stringify(result.blockers));
  assert.equal(replayCertified(f.open()).historicalNetPnlINR, null);
});
test('raw hashes, path traversal, duplicate paths and symlink escape are rejected before normalization', t => {
  const f = makeFixtureBundle(t), path = join(f.root, 'candles-0.json');
  const original = readFileSync(path); writeFileSync(path, original + ' ');
  assert.throws(() => f.open(), /RAW_HASH_MISMATCH/); writeFileSync(path, original);
  const entry = f.manifest.files[0], oldPath = entry.path;
  entry.path = '../outside'; assert.throws(() => f.open(), /UNSAFE_BUNDLE_PATH/); entry.path = oldPath;
  entry.path = f.manifest.files[1].path; assert.throws(() => f.open(), /DUPLICATE_FILE_ID_OR_PATH/); entry.path = oldPath;
  symlinkSync('/etc/hosts', join(f.root, 'escaped')); entry.path = 'escaped';
  assert.throws(() => f.open(), /BUNDLE_PATH_ESCAPE/);
});
test('mixed fixture/history manifests and duplicate sessions cannot pass', t => {
  const f = makeFixtureBundle(t); f.manifest.kind = 'HISTORICAL_MARKET';
  assert.throws(() => f.open(), /FILE_ROLE_HASH_OR_KIND_REQUIRED/);
  f.manifest.kind = 'SYNTHETIC_FIXTURE'; f.manifest.sessions.push(f.day);
  assert.throws(() => f.open(), /DUPLICATE_SESSION/);
});
test('pinned review is independent, source-specific, zero-cost, time-valid and manifest-bound', t => {
  const f = makeFixtureBundle(t), b = f.open(), valid = f.review();
  assert.equal(independentReview(b, valid.review, valid.expectedReviewSha256, valid.reviewRaw).decision, 'APPROVED');
  assert.throws(() => independentReview(b, valid.review, '0'.repeat(64), valid.reviewRaw), /PINNED_EXTERNAL_REVIEW/);
  for (const mutate of [
    r => { r.reviewer = b.manifest.producer; }, r => { r.manifestSha256 = '1'.repeat(64); },
    r => { r.checks.fullPointInTimeUniverse = 'UNVERIFIED'; },
    r => { r.permissions.derivedPerformancePublication = 'DENIED'; }, r => { r.grants = []; },
    r => { r.grants[0].additionalCostINR = 499; }, r => { r.grants[0].sourceId = 'another-source'; },
    r => { r.grants[0].validThrough = '2026-10-20T00:00:00Z'; },
    r => { r.reviewedAt = '2026-10-22T00:00:00Z'; },
  ]) {
    const review = structuredClone(valid.review); mutate(review); const raw = Buffer.from(JSON.stringify(review));
    assert.throws(() => independentReview(b, review, sha256(raw), raw));
  }
});
test('reproducibility binds exact bytes and produces identical daily/monthly null results', t => {
  const f = makeFixtureBundle(t), first = auditCampaign(f.open()).report, second = auditCampaign(f.open()).report;
  assert.deepEqual(first, second); const { reportHash, ...body } = first; assert.equal(reportHash, objectHash(body));
  f.manifest.producer += ' revised'; assert.notEqual(auditCampaign(f.open()).report.reportHash, first.reportHash);
});
test('fixture bridge exercises whole-share slots, fees, slippage, stops and realized accounting', t => {
  const f = makeFixtureBundle(t), b = f.open(), a = auditSession(b, f.day), input = toAdvancedInput(b, f.day, a);
  const result = runScalpStormDay(input);
  assert.equal(result.dataKind, 'SYNTHETIC_FIXTURE'); assert.equal(result.stocks.length, 10);
  assert(result.feesINR > 0); assert.equal(result.realOrdersPlaced, 0);
  for (const stock of result.stocks) {
    assert(Number.isInteger(stock.entryQuantity)); assert(stock.usedCapitalINR <= 10000);
    assert(stock.fills[0].priceINR >= input.datasets.find(d => d.instrument.id === stock.instrumentId).candles[25].open);
  }
  const finances = dailyFinancials(result);
  assert.equal(finances.unrealizedPnlINR, 0); assert.equal(finances.realizedPnlINR, result.netPnlINR);
  const stopped = structuredClone(input);
  for (const data of stopped.datasets) { data.candles[26].open = 90; data.candles[26].low = 89; data.candles[26].close = 90; }
  const stopResult = runScalpStormDay(stopped);
  assert(stopResult.stocks.every(s => s.fills.some(f => f.reason === 'STOP_LOSS')));
  assert.equal(replayCertified(b, f.review()).historicalNetPnlINR, null);
});
