import { requireThat, finite, integer, epoch, digest, freeze, safeUrl, compareIds } from './core.mjs';

export const MARKET_SCHEMA = 'atlas.market.v1';
export const KINDS = Object.freeze(['HISTORICAL_MARKET', 'SYNTHETIC_FIXTURE']);
export function provenance(input) {
  requireThat(input && KINDS.includes(input.kind), 'INVALID_PROVENANCE_KIND');
  requireThat(typeof input.provider === 'string' && input.provider.length > 0
    && input.provider.length <= 120, 'INVALID_PROVIDER');
  requireThat(/^[a-f0-9]{64}$/.test(input.rawSha256), 'MISSING_RAW_HASH');
  requireThat(input.researchUseAllowed === true, 'RESEARCH_RIGHTS_UNVERIFIED');
  requireThat(typeof input.displayToThirdPartiesAllowed === 'boolean', 'MISSING_DISPLAY_RIGHTS');
  requireThat(typeof input.licenseRef === 'string' && input.licenseRef.length > 0, 'MISSING_LICENSE_REFERENCE');
  return freeze({
    kind: input.kind, provider: input.provider,
    sourceUrl: safeUrl(input.sourceUrl, input.kind === 'SYNTHETIC_FIXTURE'),
    retrievedAt: epoch(input.retrievedAt), rawSha256: input.rawSha256,
    researchUseAllowed: true, displayToThirdPartiesAllowed: input.displayToThirdPartiesAllowed,
    licenseRef: input.licenseRef, availabilityMode: input.availabilityMode ?? 'ASSUMED_BAR_CLOSE',
  });
}
export function instrument(input) {
  requireThat(input && typeof input.id === 'string'
    && /^[A-Za-z0-9_&.:-]{1,80}$/.test(input.id), 'INVALID_INSTRUMENT_ID');
  requireThat(['CRYPTO', 'NSE_EQUITY', 'NSE_INDEX'].includes(input.assetClass), 'UNSUPPORTED_ASSET_CLASS');
  requireThat(input.currency === 'INR' && typeof input.venue === 'string' && input.venue.length > 0,
    'INVALID_MARKET');
  const lotSize = finite(input.lotSize, 'lotSize', { min: 1e-8, max: 1e9 });
  const priceTick = finite(input.priceTick, 'priceTick', { min: 1e-8, max: 1e6 });
  if (input.assetClass !== 'CRYPTO') requireThat(Number.isInteger(lotSize) && lotSize >= 1,
    'NSE_WHOLE_SHARES_REQUIRED');
  return freeze({ id: input.id, assetClass: input.assetClass, currency: 'INR',
    venue: input.venue, lotSize, priceTick });
}
export function importDataset(input, { asOf } = {}) {
  requireThat(input?.schema === MARKET_SCHEMA, 'INVALID_MARKET_SCHEMA');
  const market = instrument(input.instrument), source = provenance(input.provenance);
  requireThat(['RECORDED_PUBLICATION', 'ASSUMED_BAR_CLOSE'].includes(source.availabilityMode),
    'INVALID_AVAILABILITY_MODE');
  const at = epoch(asOf ?? source.retrievedAt);
  const intervalMs = integer(input.intervalMs, 'intervalMs', { min: 1000, max: 86400000 });
  requireThat(Array.isArray(input.candles) && input.candles.length > 0
    && input.candles.length <= 50000, 'INVALID_CANDLE_COUNT');
  const seen = new Set();
  let previous = 0;
  const candles = input.candles.map(row => {
    requireThat(row && typeof row === 'object', 'INVALID_CANDLE');
    const time = epoch(row.time);
    requireThat(time % intervalMs === 0, 'MISALIGNED_CANDLE');
    requireThat(!seen.has(time), 'DUPLICATE_CANDLE');
    seen.add(time);
    requireThat(time > previous, 'REORDERED_CANDLES');
    if (market.assetClass === 'CRYPTO' && previous)
      requireThat(time === previous + intervalMs, 'MISSING_CANDLE');
    if (market.assetClass !== 'CRYPTO' && previous
      && Math.floor((time + 19800000) / 86400000) === Math.floor((previous + 19800000) / 86400000))
      requireThat(time === previous + intervalMs, 'MISSING_NSE_CANDLE');
    previous = time;
    const availableAt = epoch(row.availableAt);
    requireThat(availableAt >= time + intervalMs, 'PREMATURE_CANDLE_AVAILABILITY');
    requireThat(time + intervalMs <= at && availableAt <= at, 'UNFINISHED_OR_FUTURE_CANDLE');
    requireThat(availableAt <= source.retrievedAt, 'AVAILABILITY_AFTER_RETRIEVAL');
    for (const key of ['open', 'high', 'low', 'close']) finite(row[key], key, { min: Number.MIN_VALUE });
    finite(row.volume, 'volume', { min: 0 });
    if (market.assetClass !== 'CRYPTO') integer(row.volume, 'share volume');
    requireThat(row.low <= Math.min(row.open, row.close)
      && row.high >= Math.max(row.open, row.close) && row.low <= row.high, 'INCONSISTENT_OHLC');
    return { time, availableAt, open: row.open, high: row.high, low: row.low,
      close: row.close, volume: row.volume };
  });
  let expectedTimes = null;
  if (input.expectedTimes !== undefined && input.expectedTimes !== null) {
    requireThat(Array.isArray(input.expectedTimes) && input.expectedTimes.length === candles.length,
      'DECLARED_GRID_MISMATCH');
    expectedTimes = input.expectedTimes.map(value => epoch(value));
    requireThat(expectedTimes.every((t, i) => t === candles[i].time), 'MISSING_EXPECTED_CANDLE');
  }
  let corporateActions = null;
  if (market.assetClass !== 'CRYPTO') {
    requireThat(expectedTimes !== null, 'EQUITY_GRID_REQUIRED');
    const ca = input.corporateActions;
    requireThat(ca?.reviewed === true && Array.isArray(ca.actions), 'CORPORATE_ACTION_REVIEW_REQUIRED');
    const reviewedThrough = epoch(ca.reviewedThrough);
    requireThat(reviewedThrough >= candles.at(-1).time + intervalMs, 'CORPORATE_ACTION_COVERAGE_GAP');
    requireThat(reviewedThrough <= source.retrievedAt && reviewedThrough <= at,
      'FUTURE_CORPORATE_ACTION_REVIEW');
    const actions = ca.actions.map(action => {
      requireThat(['SPLIT', 'DIVIDEND', 'SYMBOL_CHANGE', 'DELISTING'].includes(action.type),
        'UNSUPPORTED_CORPORATE_ACTION');
      const effectiveAt = epoch(action.effectiveAt), knownAt = epoch(action.knownAt);
      requireThat(knownAt <= at && knownAt <= source.retrievedAt, 'FUTURE_CORPORATE_ACTION_KNOWLEDGE');
      requireThat(effectiveAt <= candles[0].time || effectiveAt > candles.at(-1).time + intervalMs,
        'UNRESOLVED_CORPORATE_ACTION',
        'Raw candles crossing corporate actions need a separate audited adjustment run');
      return { type: action.type, effectiveAt, knownAt };
    });
    corporateActions = { reviewed: true, reviewedThrough,
      sourceUrl: safeUrl(ca.sourceUrl, source.kind === 'SYNTHETIC_FIXTURE'), actions };
  }
  const normalized = { schema: MARKET_SCHEMA, instrument: market, provenance: source,
    intervalMs, candles, expectedTimes, corporateActions };
  return freeze({ ...normalized, hash: digest(normalized),
    quality: { declaredGridComplete: true, externallyAudited: false,
      publicationTimingAssumed: source.availabilityMode === 'ASSUMED_BAR_CLOSE',
      priceType: source.kind === 'SYNTHETIC_FIXTURE' ? 'SYNTHETIC_FIXTURE' : 'SOURCE_CANDLE',
      executableQuotesVerified: false } });
}
export function closedPrefix(dataset, openTime) {
  const time = epoch(openTime), history = [];
  for (const bar of dataset.candles) {
    if (bar.time + dataset.intervalMs > time || bar.availableAt > time) break;
    history.push(bar);
  }
  return freeze(history);
}
export function universeAt(input, decisionTime) {
  const at = epoch(decisionTime);
  requireThat(input?.schema === 'atlas.universe.v1' && input.completeEligibleUniverse === true,
    'COMPLETE_POINT_IN_TIME_UNIVERSE_REQUIRED');
  const source = provenance(input.provenance), knownAt = epoch(input.knownAt);
  requireThat(knownAt <= at && knownAt <= source.retrievedAt, 'FUTURE_UNIVERSE');
  requireThat(Array.isArray(input.instruments) && input.instruments.length > 0, 'EMPTY_UNIVERSE');
  const ids = new Set();
  const members = input.instruments.map(row => {
    requireThat(typeof row.id === 'string' && /^[A-Za-z0-9_&.:-]{1,80}$/.test(row.id),
      'INVALID_UNIVERSE_MEMBER');
    requireThat(!ids.has(row.id), 'DUPLICATE_UNIVERSE_MEMBER'); ids.add(row.id);
    const availableAt = epoch(row.availableAt), effectiveFrom = epoch(row.effectiveFrom);
    const effectiveTo = row.effectiveTo == null ? null : epoch(row.effectiveTo);
    requireThat(availableAt <= at, 'FUTURE_MEMBERSHIP');
    requireThat(availableAt <= knownAt, 'MEMBERSHIP_AFTER_SNAPSHOT');
    requireThat(effectiveTo === null || effectiveTo > effectiveFrom, 'INVALID_MEMBERSHIP_WINDOW');
    return { id: row.id, availableAt, effectiveFrom, effectiveTo };
  }).filter(row => row.effectiveFrom <= at && (row.effectiveTo === null || at < row.effectiveTo))
    .sort((a, b) => compareIds(a.id, b.id));
  requireThat(members.length > 0, 'NO_ELIGIBLE_INSTRUMENTS');
  return freeze({ source, knownAt, instruments: members,
    hash: digest({ source, knownAt, instruments: members }) });
}
export function validateQuote(input, { now, maxAgeMs = 90000 } = {}) {
  requireThat(input?.schema === 'atlas.quote.v1' && input.kind === 'OBSERVED_MARKET_QUOTE',
    'INVALID_QUOTE_KIND');
  const time = epoch(input.sourceAt), observedAt = epoch(input.observedAt), at = epoch(now);
  finite(maxAgeMs, 'maxAgeMs', { min: 0 });
  requireThat(time <= observedAt && observedAt <= at && at - time <= maxAgeMs, 'STALE_OR_FUTURE_QUOTE');
  finite(input.price, 'quote price', { min: Number.MIN_VALUE });
  requireThat(input.currency === 'INR' && typeof input.symbol === 'string', 'INVALID_QUOTE');
  return freeze({ ...input, sourceAt: time, observedAt, executable: false });
}
export function importCoinDCX(input, { provenance: source, instrument: market, intervalMs, asOf } = {}) {
  requireThat(Array.isArray(input), 'INVALID_COINDCX_PAYLOAD');
  const rows = input.map(row => ({ ...row, time: epoch(row.time),
    availableAt: epoch(row.time) + intervalMs })).sort((a, b) => a.time - b.time);
  // CoinDCX returns newest first; duplicates remain errors after adapter-only ordering.
  return importDataset({ schema: MARKET_SCHEMA, instrument: market, intervalMs,
    provenance: { ...source, availabilityMode: 'ASSUMED_BAR_CLOSE' }, candles: rows }, { asOf });
}
