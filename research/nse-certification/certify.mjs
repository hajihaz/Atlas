import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { NSE_SESSIONS, sessionTime } from '../advanced/calendar.mjs';
import { check, json, instant, minuteInstant, safeUrl, sha256, objectHash, normalizeCandles, coverage, grid } from './normalize.mjs';

export const POLICY = 'FULL_NSE_CASH_INTRADAY_ELIGIBLE_STOCKS';
const HASH = /^[a-f0-9]{64}$/;
const ROLES = new Set(['ORIGINAL', 'CANDLES', 'UNIVERSE', 'MASTER', 'ELIGIBILITY', 'SUSPENSIONS',
  'IDENTITY', 'ACTIONS', 'PUBLICATION', 'RIGHTS']);
export const REVIEW_CHECKS = Object.freeze(['authenticSource', 'fullPointInTimeUniverse',
  'rawUnadjustedPricesAndShareVolumes', 'corporateActionsAndIdentity', 'recordedPublicationAvailability',
  'privateOfflineUsePermitted', 'derivedResultsPermitted']);

export function openBundle(root, manifestPath) {
  const base = realpathSync(root);
  function bytes(path, limit = 32 * 1024 * 1024) {
    check(typeof path === 'string' && !isAbsolute(path) && !path.split(/[\\/]/).includes('..'), 'UNSAFE_BUNDLE_PATH');
    const target = realpathSync(resolve(base, path)), rel = relative(base, target);
    check(rel !== '' && !rel.startsWith('..') && !isAbsolute(rel), 'BUNDLE_PATH_ESCAPE');
    check(statSync(target).isFile() && statSync(target).size <= limit, 'NON_FILE_OR_OVERSIZED_INPUT');
    return readFileSync(target);
  }
  const raw = bytes(manifestPath, 64 * 1024 * 1024), manifest = json(raw);
  check(manifest.schema === 'atlas.nse-bundle.v1' && ['HISTORICAL_MARKET', 'SYNTHETIC_FIXTURE'].includes(manifest.kind), 'BUNDLE_SCHEMA_REQUIRED');
  check(typeof manifest.producer === 'string' && manifest.producer.length > 0, 'PRODUCER_REQUIRED');
  check(Array.isArray(manifest.files) && manifest.files.length <= 100000
    && Array.isArray(manifest.sessions) && manifest.sessions.length <= 20, 'BOUNDED_MANIFEST_REQUIRED');
  const files = new Map(), paths = new Set();
  for (const file of manifest.files) {
    check(typeof file.id === 'string' && /^[A-Za-z0-9_.-]{1,120}$/.test(file.id)
      && !files.has(file.id) && !paths.has(file.path), 'DUPLICATE_FILE_ID_OR_PATH');
    check(ROLES.has(file.role) && HASH.test(file.sha256) && file.kind === manifest.kind, 'FILE_ROLE_HASH_OR_KIND_REQUIRED');
    safeUrl(file.sourceUrl); instant(file.retrievedAt);
    if (file.publishedAt !== undefined) check(instant(file.publishedAt) <= instant(file.retrievedAt), 'PUBLICATION_AFTER_RETRIEVAL');
    files.set(file.id, file); paths.add(file.path);
  }
  check(new Set(manifest.sessions.map(d => d.session)).size === manifest.sessions.length, 'DUPLICATE_SESSION');
  check(manifest.sessions.every(d => NSE_SESSIONS.includes(d.session)), 'SESSION_OUTSIDE_SCOPED_CALENDAR');
  function read(id, role) {
    const file = files.get(id);
    check(file && (!role || file.role === role), 'MISSING_OR_WRONG_EVIDENCE_ROLE', id);
    const raw = bytes(file.path);
    check(sha256(raw) === file.sha256, 'RAW_HASH_MISMATCH', id);
    return { file, raw };
  }
  // Even unused declared evidence must be hash-valid. A partial corrupt archive is not accepted.
  for (const id of files.keys()) read(id);
  return { manifest, manifestSha256: sha256(raw), files, read };
}

export function validateUniverse(universe, session, bundle) {
  const open = sessionTime(session, 9, 15), close = sessionTime(session, 15, 30);
  check(universe.schema === 'atlas.nse-universe.v1' && universe.session === session
    && universe.exchange === 'NSE' && universe.segment === 'CASH'
    && universe.scope === POLICY && universe.selection === 'PREOPEN_FULL_ELIGIBLE_UNIVERSE', 'FULL_PIT_UNIVERSE_REQUIRED');
  check(instant(universe.knownAt) < open && instant(universe.effectiveAt) <= open, 'RETROSPECTIVE_UNIVERSE');
  check(Array.isArray(universe.members) && universe.members.length >= 10
    && universe.members.length <= 10000, 'INVALID_UNIVERSE_COUNT');
  // A current master or EOD bhavcopy alone cannot satisfy these separate evidence roles.
  for (const [key, role] of [['master', 'MASTER'], ['eligibility', 'ELIGIBILITY'],
    ['suspensions', 'SUSPENSIONS'], ['identity', 'IDENTITY']]) {
    const { file, raw } = bundle.read(universe.evidence?.[key], role);
    check(file.publishedAt && instant(file.publishedAt) < open, 'UNIVERSE_SOURCE_NOT_PREOPEN', role);
    check(instant(file.publishedAt) <= instant(universe.knownAt), 'UNIVERSE_KNOWLEDGE_BEFORE_SOURCE');
    // Require dated enumerations, not caller booleans. Original provider payloads are separately retained.
    const evidence = json(raw);
    check(evidence.schema === 'atlas.nse-reference-evidence.v1' && evidence.session === session
      && evidence.scope === POLICY && Array.isArray(evidence.instrumentIds), 'DATED_REFERENCE_ENUMERATION_REQUIRED', role);
    const ids = evidence.instrumentIds;
    check(new Set(ids).size === ids.length, 'DUPLICATE_REFERENCE_MEMBER');
    if (role !== 'SUSPENSIONS') check(universe.members.every(m => ids.includes(m.id)), 'MEMBER_ABSENT_FROM_REFERENCE', role);
    else check(universe.members.every(m => !ids.includes(m.id)), 'SUSPENDED_MEMBER_INCLUDED');
    if (role === 'ELIGIBILITY') {
      const suspended = json(bundle.read(universe.evidence.suspensions, 'SUSPENSIONS').raw).instrumentIds;
      check(ids.filter(id => !suspended.includes(id)).length === universe.members.length, 'ELIGIBLE_MEMBER_OMISSION');
    }
    // Normalized enumerations must be bound to an original, hashed provider artifact.
    const original = bundle.read(evidence.originalFileId, 'ORIGINAL');
    check(original.file.id !== file.id && original.file.publishedAt
      && instant(original.file.publishedAt) <= instant(file.publishedAt), 'ORIGINAL_REFERENCE_REQUIRED');
  }
  const ids = new Set(), symbols = new Set();
  for (const member of universe.members) {
    check(typeof member.id === 'string' && /^NSE_EQ\|INE[A-Z0-9]{9}$/.test(member.id)
      && member.id === `NSE_EQ|${member.isin}`, 'STABLE_ISIN_IDENTITY_REQUIRED');
    check(typeof member.symbol === 'string' && /^[A-Z0-9&_.-]{1,50}$/.test(member.symbol)
      && !ids.has(member.id) && !symbols.has(member.symbol), 'DUPLICATE_OR_INVALID_MEMBER');
    ids.add(member.id); symbols.add(member.symbol);
    check(member.series === 'EQ' && member.lotSize === 1 && typeof member.priceTickINR === 'number'
      && Number.isFinite(member.priceTickINR) && member.priceTickINR > 0, 'WHOLE_EQUITY_METADATA_REQUIRED');
    check(instant(member.knownAt) <= instant(universe.knownAt)
      && instant(member.effectiveFrom) <= open && instant(member.effectiveTo) >= close, 'MEMBER_NOT_KNOWN_OR_EFFECTIVE');
    check(typeof member.shortEligible === 'boolean', 'SHORT_ELIGIBILITY_STATUS_REQUIRED');
  }
  return [...universe.members].sort((a, b) => a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0);
}

function actionReview(actions, session, members, bundle) {
  check(actions.schema === 'atlas.nse-actions.v1' && actions.session === session
    && actions.priceBasis === 'RAW_UNADJUSTED'
    && instant(actions.reviewedFrom) <= sessionTime(session, 9, 15)
    && instant(actions.reviewedThrough) >= sessionTime(session, 15, 30)
    && Array.isArray(actions.instruments) && Array.isArray(actions.events), 'ACTION_REVIEW_INCOMPLETE');
  const ids = members.map(m => m.id).concat('NSE_INDEX|Nifty 50');
  check(new Set(actions.instruments).size === actions.instruments.length
    && actions.instruments.length === ids.length && ids.every(id => actions.instruments.includes(id)), 'ACTION_REVIEW_UNIVERSE_MISMATCH');
  bundle.read(actions.originalFileId, 'ORIGINAL');
  for (const event of actions.events) {
    check(ids.includes(event.instrumentId) && ['SPLIT', 'BONUS', 'DIVIDEND', 'SYMBOL_CHANGE', 'DELISTING'].includes(event.type), 'UNRECOGNIZED_ACTION');
    const effective = instant(event.effectiveAt), known = instant(event.knownAt);
    check(known <= sessionTime(session, 9, 15), 'FUTURE_ACTION_KNOWLEDGE');
    check(effective <= sessionTime(session, 9, 15) || effective > sessionTime(session, 15, 30), 'INTRADAY_ACTION_UNRESOLVED');
  }
}

export function publicationMap(publication, session, datasets, bundle) {
  check(publication.schema === 'atlas.nse-publication.v1' && publication.session === session
    && publication.mode === 'RECORDED_OBSERVATION' && Array.isArray(publication.observations), 'RECORDED_PUBLICATION_REQUIRED');
  const byKey = new Map(), byId = new Map(datasets.map(d => [d.instrumentId,
    { dataset: d, rows: new Map(d.rows.map(r => [r.time, r])) }]));
  const proofCache = new Map(), originalCache = new Map();
  for (const observation of publication.observations) {
    const time = minuteInstant(observation.minute), available = instant(observation.availableAt);
    const observed = instant(observation.observedAt), key = `${observation.instrumentId}@${time}`;
    check(!byKey.has(key) && byId.has(observation.instrumentId), 'DUPLICATE_OR_UNKNOWN_PUBLICATION');
    check(available >= time + 60000 && observed >= available, 'PREMATURE_PUBLICATION');
    const row = byId.get(observation.instrumentId).rows.get(time);
    check(row && objectHash(row) === observation.candleHash, 'PUBLICATION_CANDLE_HASH_MISMATCH');
    if (!proofCache.has(observation.evidenceFileId)) {
      const { file, raw } = bundle.read(observation.evidenceFileId, 'PUBLICATION'), payload = json(raw);
      const records = payload.schema === 'atlas.nse-observation-receipt.v1' ? [payload]
        : payload.schema === 'atlas.nse-observation-receipts.v1' ? payload.observations : null;
      check(Array.isArray(records) && records.length > 0 && records.length <= 100000, 'OBSERVATION_RECEIPTS_REQUIRED');
      const proofs = new Map();
      for (const proof of records) {
        const proofKey = `${proof.instrumentId}@${minuteInstant(proof.minute)}`;
        check(!proofs.has(proofKey), 'DUPLICATE_OBSERVATION_PROOF'); proofs.set(proofKey, proof);
      }
      proofCache.set(observation.evidenceFileId, { file, proofs });
    }
    const { file, proofs } = proofCache.get(observation.evidenceFileId);
    check(file.publishedAt && instant(file.publishedAt) <= observed
      && instant(file.retrievedAt) >= observed, 'PUBLICATION_TIMESTAMP_EVIDENCE_REQUIRED');
    const proof = proofs.get(key);
    check(proof && proof.candleHash === observation.candleHash
      && proof.instrumentId === observation.instrumentId && instant(proof.observedAt) === observed
      && instant(proof.availableAt) === available && minuteInstant(proof.minute) === time, 'OBSERVATION_RECEIPT_MISMATCH');
    if (!originalCache.has(proof.originalFileId)) originalCache.set(proof.originalFileId,
      bundle.read(proof.originalFileId, 'ORIGINAL').file);
    const original = { file: originalCache.get(proof.originalFileId) };
    check(original.file.publishedAt && instant(original.file.publishedAt) <= observed
      && original.file.sha256 === proof.originalSha256, 'ORIGINAL_OBSERVATION_PAYLOAD_REQUIRED');
    // External timestamp truth/authenticity remains an explicit independent-review boundary.
    byKey.set(key, { availableAt: available, observedAt: observed });
  }
  const decision = sessionTime(session, 9, 30);
  for (const dataset of datasets) for (const row of dataset.rows)
    check(byKey.has(`${dataset.instrumentId}@${row.time}`), 'MISSING_FULL_SESSION_PUBLICATION_RECORD');
  for (const dataset of datasets) for (const time of grid(session, 15)) {
    const p = byKey.get(`${dataset.instrumentId}@${time}`);
    check(p && p.availableAt <= decision && p.observedAt <= decision, 'OPENING_BAR_NOT_KNOWN_AT_DECISION');
  }
  return byKey;
}

export function rankOpening(session, members, datasets, publications) {
  check(members.length >= 10 && datasets.length === members.length
    && new Set(datasets.map(d => d.instrumentId)).size === datasets.length, 'FULL_CANDIDATE_COVERAGE_REQUIRED');
  const byId = new Map(datasets.map(d => [d.instrumentId, d]));
  const ranked = members.map(member => {
    const dataset = byId.get(member.id);
    check(dataset && dataset.volumeUnit === 'SHARES' && dataset.symbol === member.symbol, 'CANDIDATE_OR_VOLUME_UNIT_MISMATCH');
    const byTime = new Map(dataset.rows.map(r => [r.time, r]));
    let cumulativeShareVolume = 0;
    for (const time of grid(session, 15)) {
      const row = byTime.get(time), p = publications.get(`${member.id}@${time}`);
      check(row && p && p.availableAt <= sessionTime(session, 9, 30)
        && p.observedAt <= sessionTime(session, 9, 30), 'INCOMPLETE_OR_LATE_OPENING_VOLUME');
      cumulativeShareVolume += row.volume;
      check(Number.isSafeInteger(cumulativeShareVolume), 'SHARE_VOLUME_OVERFLOW');
    }
    return { instrumentId: member.id, symbol: member.symbol, cumulativeShareVolume };
  });
  return ranked.sort((a, b) => b.cumulativeShareVolume - a.cumulativeShareVolume
    || (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
}

export function auditSession(bundle, day) {
  const session = day.session, blockers = [], checks = {};
  let universe, members, datasets, index, publications, actions, ranking;
  function step(name, fn) {
    try { const value = fn(); checks[name] = 'PASS'; return value; }
    catch (error) { checks[name] = 'FAIL'; blockers.push({ gate: name, code: error.code ?? 'INVALID_INPUT', detail: error.message }); }
  }
  step('universe', () => {
    universe = json(bundle.read(day.universeFileId, 'UNIVERSE').raw);
    members = validateUniverse(universe, session, bundle); return members;
  });
  if (members) {
    datasets = step('candles', () => {
      check(Array.isArray(day.candleFileIds) && day.candleFileIds.length === members.length, 'ALL_ELIGIBLE_CANDLES_REQUIRED');
      const data = day.candleFileIds.map(id => {
        const { file, raw } = bundle.read(id, 'CANDLES');
        const member = members.find(m => m.id === file.instrumentId);
        check(member && file.session === session, 'CANDLE_MEMBERSHIP_MISMATCH');
        const d = normalizeCandles(raw, { ...file, symbol: member.symbol });
        check(d.priceBasis === 'RAW_UNADJUSTED', 'BACK_ADJUSTED_OR_UNKNOWN_PRICE_BASIS');
        const c = coverage(d); check(c.complete, 'FULL_SESSION_MINUTE_GAP', `${member.symbol}: ${c.observed}/375`);
        check(instant(file.retrievedAt) >= sessionTime(session, 15, 30), 'INCOMPLETE_CAPTURE_TIME');
        return d;
      });
      check(new Set(data.map(d => d.instrumentId)).size === members.length, 'DUPLICATE_CANDIDATE_FILE'); return data;
    });
    index = step('index', () => {
      const { file, raw } = bundle.read(day.indexFileId, 'CANDLES');
      check(file.instrumentId === 'NSE_INDEX|Nifty 50' && file.session === session, 'NIFTY_IDENTITY_REQUIRED');
      const d = normalizeCandles(raw, { ...file, symbol: 'NIFTY50' });
      check(coverage(d, grid(session, 15)).complete && d.priceBasis === 'RAW_UNADJUSTED', 'NIFTY_OPENING_GAP_OR_ADJUSTMENT');
      return d;
    });
    actions = step('actions', () => {
      const { file, raw } = bundle.read(day.actionsFileId, 'ACTIONS'), result = json(raw);
      check(instant(result.reviewedThrough) <= instant(file.retrievedAt), 'ACTION_REVIEW_AFTER_RETRIEVAL');
      actionReview(result, session, members, bundle); return result;
    });
    if (datasets && index) {
      publications = step('publication', () => publicationMap(json(bundle.read(day.publicationFileId, 'PUBLICATION').raw),
        session, [...datasets, index], bundle));
      if (publications) ranking = step('ranking', () => rankOpening(session, members, datasets, publications));
    }
  }
  step('rightsEvidence', () => {
    check(Array.isArray(day.rightsFileIds) && day.rightsFileIds.length > 0, 'WRITTEN_RIGHTS_EVIDENCE_REQUIRED');
    for (const id of day.rightsFileIds) bundle.read(id, 'RIGHTS');
  });
  const technicalPass = ['universe', 'candles', 'index', 'actions', 'publication', 'ranking', 'rightsEvidence']
    .every(name => checks[name] === 'PASS');
  return { session, checks, blockers, technicalPass, universe, members, datasets, index, publications, actions, ranking };
}

export function independentReview(bundle, review, expectedSha256, reviewRaw) {
  check(reviewRaw && HASH.test(expectedSha256) && sha256(reviewRaw) === expectedSha256, 'PINNED_EXTERNAL_REVIEW_REQUIRED');
  check(review.schema === 'atlas.nse-independent-review.v1' && review.manifestSha256 === bundle.manifestSha256
    && review.decision === 'APPROVED' && review.reviewer !== bundle.manifest.producer
    && typeof review.reviewer === 'string' && review.reviewer.length > 0, 'INDEPENDENT_MANIFEST_BOUND_REVIEW_REQUIRED');
  const reviewedAt = instant(review.reviewedAt);
  check(Array.isArray(review.sessions) && new Set(review.sessions).size === review.sessions.length
    && review.sessions.every(s => NSE_SESSIONS.includes(s)), 'INVALID_REVIEW_SESSION_SCOPE');
  for (const name of REVIEW_CHECKS) check(review.checks?.[name] === 'VERIFIED', 'REVIEW_GATE_UNVERIFIED', name);
  const allFiles = [...bundle.files.values()];
  check(allFiles.every(f => instant(f.retrievedAt) <= reviewedAt), 'REVIEW_PRECEDES_EVIDENCE');
  check(review.permissions?.privateOfflineResearch === 'GRANTED'
    && review.permissions?.derivedPerformancePublication === 'GRANTED'
    && typeof review.permissions.rawRedistribution === 'boolean', 'USE_RIGHTS_NOT_GRANTED');
  check(Array.isArray(review.grants) && review.grants.length > 0, 'SOURCE_SPECIFIC_GRANTS_REQUIRED');
  const data = allFiles.filter(f => f.role !== 'RIGHTS');
  for (const file of data) {
    const grant = review.grants.find(g => g.sourceId === file.sourceId);
    check(grant && typeof file.sourceId === 'string' && grant.privateOfflineResearch === 'GRANTED'
      && grant.derivedPerformancePublication === 'GRANTED'
      && grant.additionalCostINR === 0
      && instant(grant.validFrom) <= instant(file.retrievedAt)
      && instant(grant.validThrough) >= reviewedAt
      && instant(grant.dataFrom) <= sessionTime(NSE_SESSIONS[0], 9, 15)
      && instant(grant.dataThrough) >= sessionTime(NSE_SESSIONS.at(-1), 15, 30),
    'UNLICENSED_SOURCE_OR_EXPIRED_GRANT', file.id);
    bundle.read(grant.evidenceFileId, 'RIGHTS');
  }
  return review;
}

export function auditCampaign(bundle, { reviewRaw = null, expectedReviewSha256 = null } = {}) {
  // Retain summaries, not twenty sessions of full-market candles. Replay reopens one day at a time.
  const sessions = new Map();
  for (const day of bundle.manifest.sessions) {
    const audit = auditSession(bundle, day);
    sessions.set(day.session, { session: day.session, technicalPass: audit.technicalPass,
      checks: audit.checks, blockers: audit.blockers, memberCount: audit.members?.length ?? null,
      ranking: audit.ranking });
  }
  let review = null, reviewError = 'NO_PINNED_INDEPENDENT_REVIEW';
  if (reviewRaw) {
    try { review = independentReview(bundle, json(reviewRaw), expectedReviewSha256, reviewRaw); reviewError = null; }
    catch (error) { reviewError = error.code ?? 'INVALID_REVIEW'; }
  }
  const historical = bundle.manifest.kind === 'HISTORICAL_MARKET';
  const daily = NSE_SESSIONS.map(session => {
    const audited = sessions.get(session), certified = Boolean(historical && audited?.technicalPass && review?.sessions.includes(session));
    const reasons = audited?.blockers ?? [{ gate: 'input', code: 'MISSING_SESSION_BUNDLE' }];
    const blockers = [...reasons];
    if (!historical) blockers.push({ gate: 'authenticity', code: 'SYNTHETIC_FIXTURE_NEVER_REAL_SESSION' });
    if (!review || !review.sessions.includes(session)) blockers.push({ gate: 'independentReview', code: reviewError ?? 'SESSION_OUTSIDE_REVIEW' });
    return { session, status: certified ? 'CERTIFIED_SOURCE_INPUT' : 'UNVERIFIED',
      technicalPass: audited?.technicalPass ?? false, certified, blockers,
      eligibleStockCount: audited?.memberCount ?? null,
      selected: certified ? audited.ranking.slice(0, 10) : null,
      trades: null, realizedPnlINR: null, unrealizedPnlINR: null, feesINR: null,
      netPnlINR: null, returnPct: null, maxDrawdownPct: null, endingEquityINR: null };
  });
  const result = { schema: 'atlas.nse-certification.v1', manifestSha256: bundle.manifestSha256,
    dataKind: bundle.manifest.kind, realSessionsCertified: daily.filter(d => d.certified).length,
    expectedSessions: 20, technicalSessionsPassed: daily.filter(d => d.technicalPass).length,
    reviewSha256: review ? expectedReviewSha256 : null,
    reviewBoundary: 'Hashes verify bytes. Source authenticity, publication timestamps and legal grants require independent documentary review.',
    capitalINR: 100000, slots: 10, slotINR: 10000,
    realOrdersEnabled: false, realOrdersPlaced: 0, daily,
    months: ['2026-09', '2026-10'].map(month => ({ month,
      expectedSessions: daily.filter(d => d.session.startsWith(month)).length,
      certifiedSessions: daily.filter(d => d.session.startsWith(month) && d.certified).length,
      trades: null, netPnlINR: null, realizedPnlINR: null, unrealizedPnlINR: null,
      feesINR: null, returnPct: null, maxDrawdownPct: null, frequentlySelectedStocks: null })),
    historicalNetPnlINR: null, historicalReturnPct: null, historicalMaxDrawdownPct: null,
    frequentlySelectedStocks: null, financialStatus: 'NOT_SIMULATED_UNTIL_ALL_20_SOURCE_SESSIONS_CERTIFIED' };
  return { report: { ...result, reportHash: objectHash(result) }, sessions, review };
}
