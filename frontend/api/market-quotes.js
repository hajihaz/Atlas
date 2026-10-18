// Public, read-only market observation gateway. Never accepts order parameters or credentials.
// A public quote is NOT execution-quality market data; trade authority stays disabled.
const PAIRS = Object.freeze([
  { symbol: 'BTC/USD', kraken: 'XXBTZUSD', label: 'Bitcoin' },
  { symbol: 'ETH/USD', kraken: 'XETHZUSD', label: 'Ethereum' },
]);
const STOCKS = Object.freeze(['RELIANCE', 'TCS', 'INFY']);
const UPSTREAM = 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD';
let cached = null;
let cacheUntil = 0;

export function unconnectedStocks() {
  return STOCKS.map(symbol => ({
    symbol, market: 'equity', currency: 'INR', price: null,
    provider: 'NSE via authenticated private provider', observedAt: null,
    status: 'private_connection_required', paperEligible: false,
  }));
}

export function normalizeKraken(body, retrievedAt) {
  if (!body || !Array.isArray(body.error) || body.error.length || !body.result
    || typeof body.result !== 'object') throw new Error('invalid_market_payload');
  return PAIRS.map(({ symbol, kraken, label }) => {
    const raw = body.result[kraken]?.c?.[0];
    const price = typeof raw === 'string' ? Number(raw) : NaN;
    const valid = Number.isFinite(price) && price > 0;
    return {
      symbol, label, market: 'crypto', currency: 'USD',
      price: valid ? price : null,
      provider: 'Kraken public ticker', observedAt: null, retrievedAt,
      status: valid ? 'observation_time_unverified' : 'unavailable',
      paperEligible: false,
    };
  });
}

export async function getPublicSnapshot(fetcher = fetch, now = Date.now()) {
  if (cached && cacheUntil > now) return cached;
  const retrievedAt = new Date(now).toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let crypto = [];
  let providerStatus = 'unavailable';
  try {
    const response = await fetcher(UPSTREAM, {
      method: 'GET', signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('market_provider_http_error');
    const body = await response.json();
    crypto = normalizeKraken(body, retrievedAt);
    providerStatus = crypto.some(row => row.price !== null) ? 'public_observation' : 'unavailable';
  } catch {
    crypto = PAIRS.map(({ symbol, label }) => ({
      symbol, label, market: 'crypto', currency: 'USD', price: null,
      provider: 'Kraken public ticker', observedAt: null, retrievedAt,
      status: 'unavailable', paperEligible: false,
    }));
  } finally {
    clearTimeout(timeout);
  }
  const snapshot = {
    schema: 1, source: 'public_market_observations',
    retrievedAt, crypto, equities: unconnectedStocks(),
    providerStatus, authenticatedFeed: false, liveOrdersEnabled: false,
    paperExecutionEnabled: false, warning: 'Read-only observations. Last-trade age is unverified; not suitable for order execution.',
  };
  if (providerStatus === 'public_observation') {
    cached = snapshot;
    cacheUntil = now + 25000;
  }
  return snapshot;
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'method_not_allowed' });
  }
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=25');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(200).json(await getPublicSnapshot());
}
