// A public projection of owner-local quote observations, with no execution authority.
const WATCH = Object.freeze({
  'NSE_INDEX|Nifty 50': {symbol:'NIFTY 50', priceUnit:'POINTS'},
  'NSE_EQ|INE002A01018': {symbol:'RELIANCE', priceUnit:'INR'},
});
const aware = value => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
  Number.isFinite(Date.parse(value));

export function validateNseMarketSnapshot(input, now = Date.now()) {
  if (!input || input.schema !== 1 || input.mode !== 'OWNER_NSE_OBSERVATION' ||
      input.status !== 'OK' || input.source !== 'Upstox Analytics' ||
      input.audience !== 'OWNER_ONLY' || input.realOrdersEnabled !== false ||
      input.paperOrdersEnabled !== false || input.actualCapitalINR !== 0 ||
      input.executionFreshnessCertified !== false || !aware(input.observedAt) ||
      now - Date.parse(input.observedAt) > 90000 || Date.parse(input.observedAt) > now + 5000 ||
      !/^[a-f0-9]{64}$/.test(input.sourcePayloadSHA256 ?? '')) {
    throw Error('NSE observation unavailable or stale');
  }
  const market = input.market;
  if (!market || market.exchange !== 'NSE' || !/^[A-Z_]{2,40}$/.test(market.status) ||
      typeof market.marketOpen !== 'boolean' || market.marketOpen !== (market.status === 'NORMAL_OPEN') ||
      !Array.isArray(input.quotes) || input.quotes.length !== 2) {
    throw Error('Invalid NSE observation identity');
  }
  const seen = new Set();
  const quotes = input.quotes.map(row => {
    const expected = row && Object.hasOwn(WATCH, row.instrumentKey) && WATCH[row.instrumentKey];
    if (!expected || seen.has(row.instrumentKey) || row.symbol !== expected.symbol ||
        row.priceUnit !== expected.priceUnit || !Number.isFinite(row.lastPrice) ||
        row.lastPrice <= 0 || row.lastPrice > 1e12 ||
        !(row.volume === null || Number.isSafeInteger(row.volume) && row.volume >= 0)) {
      throw Error('Invalid NSE quote');
    }
    seen.add(row.instrumentKey);
    for (const key of ['lastTradeAt','quoteTimestamp']) {
      if (row[key] !== null && (!aware(row[key]) ||
          Date.parse(row[key]) > Date.parse(input.observedAt) + 5000)) {
        throw Error('Invalid NSE source timestamp');
      }
    }
    return {instrumentKey:row.instrumentKey, symbol:expected.symbol, priceUnit:expected.priceUnit,
      lastPrice:row.lastPrice, volume:row.volume, lastTradeAt:row.lastTradeAt,
      quoteTimestamp:row.quoteTimestamp};
  });
  // Deliberately rebuild every field: never return extra provider/file fields.
  return {schema:1, mode:'OWNER_NSE_OBSERVATION', status:'OK', source:'Upstox Analytics',
    observedAt:input.observedAt, market:{exchange:'NSE', status:market.status, marketOpen:market.marketOpen},
    quotes, sourcePayloadSHA256:input.sourcePayloadSHA256, audience:'OWNER_ONLY',
    realOrdersEnabled:false, paperOrdersEnabled:false, actualCapitalINR:0,
    executionFreshnessCertified:false};
}
