// Atlas public INR market observation endpoint. No trading or credentials.
const URL = 'https://api.coindcx.com/exchange/ticker';
const MARKETS = ['BTCINR', 'ETHINR'];
const CACHE_MS = 12000;
const MAX_AGE_SECONDS = 90;
let cached = null;
let cacheAt = 0;

function unavailable(symbol, reason = 'unavailable') {
  return { symbol, currency: 'INR', price: null, bid: null, ask: null,
    sourceAt: null, ageSeconds: null, status: reason, provider: 'CoinDCX public ticker' };
}
export function normalizeTickers(payload, now = Date.now()) {
  if (!Array.isArray(payload)) throw new Error('Invalid market-data payload');
  const rows = new Map();
  for (const entry of payload) {
    if (!entry || !MARKETS.includes(entry.market)) continue;
    if (rows.has(entry.market)) throw new Error('Duplicate market');
    const stamp = entry.timestamp;
    const last = Number(entry.last_price);
    const bid = Number(entry.bid);
    const ask = Number(entry.ask);
    if (!Number.isInteger(stamp) || ![last, bid, ask].every(n => Number.isFinite(n) && n > 0)
        || bid > ask || ask / bid > 1.05 || last < bid * 0.95 || last > ask * 1.05) {
      rows.set(entry.market, unavailable(entry.market, 'invalid_source'));
      continue;
    }
    const ageSeconds = Math.floor(now / 1000) - stamp;
    if (ageSeconds < -5 || ageSeconds > MAX_AGE_SECONDS) {
      rows.set(entry.market, { ...unavailable(entry.market, 'stale_or_future'),
        sourceAt: new Date(stamp * 1000).toISOString(), ageSeconds });
      continue;
    }
    rows.set(entry.market, { symbol: entry.market, currency: 'INR',
      price: last, bid, ask, sourceAt: new Date(stamp * 1000).toISOString(),
      ageSeconds, status: 'recent_provider_snapshot', provider: 'CoinDCX public ticker' });
  }
  return MARKETS.map(market => rows.get(market) ?? unavailable(market,'missing_market'));
}
export async function getLiveFeed(fetcher = fetch, now = Date.now()) {
  if (cached && now - cacheAt >= 0 && now - cacheAt < CACHE_MS) {
    // Cache freshness must be rechecked before displaying any old quote.
    const quotes = cached.quotes.map(q => {
      if (!q.sourceAt) return q;
      const ageSeconds = Math.floor(now / 1000) - Math.floor(Date.parse(q.sourceAt) / 1000);
      return ageSeconds > MAX_AGE_SECONDS || ageSeconds < -5
        ? { ...q, price: null, bid: null, ask: null, ageSeconds, status: 'stale_or_future' }
        : { ...q, ageSeconds };
    });
    return { ...cached, quotes };
  }
  let quotes;
  let feedStatus;
  try {
    const response = await fetcher(URL, { headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Provider unavailable');
    quotes = normalizeTickers(await response.json(), now);
    feedStatus = quotes.every(q=>q.status==='recent_provider_snapshot') ? 'RECENT' : 'DEGRADED';
  } catch {
    quotes = MARKETS.map(m=>unavailable(m));
    feedStatus = 'DISCONNECTED';
  }
  cached = { schema: 1, observedAt: new Date(now).toISOString(),
    source: 'CoinDCX public ticker', feedStatus, mode: 'PUBLIC_MARKET_OBSERVATION',
    paperExecutionEnabled: false, realOrdersEnabled: false, currency: 'INR',
    quotes };
  cacheAt = now;
  return cached;
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow','GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  return res.status(200).json(await getLiveFeed());
}
