// Timestamped, read-only crypto market-data readiness feed; never enables paper/live orders.
const PAIRS = Object.freeze([
  { symbol: 'BTC/USD', kraken: 'XXBTZUSD', label: 'Bitcoin' },
  { symbol: 'ETH/USD', kraken: 'XETHZUSD', label: 'Ethereum' },
]);
const UPSTREAM = 'https://api.kraken.com/0/public/OHLC?interval=1&pair=';
const PAIR_REQUESTS = Object.freeze({ 'BTC/USD': 'XBTUSD', 'ETH/USD': 'ETHUSD' });
const INTERVAL_MS = 60000;
const MAX_AGE_MS = 10 * INTERVAL_MS;
let cache = null;
let cacheUntil = 0;

const unavailable = (pair, status) => ({
  symbol: pair.symbol, label: pair.label, status, close: null,
  observedAt: null, provider: 'Kraken public OHLC (1 minute)',
  currency: 'USD', paperEligible: false,
});

export function normalizeClosedCandles(body, now = Date.now()) {
  if (!body || !Array.isArray(body.error) || body.error.length
    || !body.result || typeof body.result !== 'object') {
    throw new Error('invalid_ohlc_payload');
  }
  return PAIRS.map(pair => {
    const rows = body.result[pair.kraken];
    if (!Array.isArray(rows) || rows.length < 2) return unavailable(pair, 'unavailable');
    // Kraken documents the last returned interval as still being formed:
    // do NOT use it as a closed bar or backtest signal.
    const closedRows = rows.slice(0, -1);
    const bar = closedRows[closedRows.length - 1];
    if (!Array.isArray(bar) || bar.length < 8) return unavailable(pair, 'invalid');
    const start = Number(bar[0]) * 1000;
    const values = bar.slice(1, 7).map(Number);
    const [open, high, low, close, , volume] = values;
    const trades = Number(bar[7]);
    const valid = Number.isSafeInteger(start) && start > 0
      && start % INTERVAL_MS === 0
      && values.every(Number.isFinite) && open > 0 && high > 0 && low > 0
      && close > 0 && high >= Math.max(open, close)
      && low <= Math.min(open, close) && volume >= 0
      && Number.isSafeInteger(trades) && trades >= 0;
    if (!valid) return unavailable(pair, 'invalid');
    if (closedRows.length > 1) {
      const prev = Number(closedRows[closedRows.length - 2]?.[0]) * 1000;
      if (!Number.isSafeInteger(prev) || prev >= start) return unavailable(pair, 'invalid');
    }
    const observedEnd = start + INTERVAL_MS;
    const ageMs = now - observedEnd;
    if (ageMs < 0) return unavailable(pair, 'future_candle');
    const recent = ageMs <= MAX_AGE_MS;
    return {
      symbol: pair.symbol, label: pair.label, status: recent ? 'recent_closed_candle' : 'stale',
      close, observedAt: new Date(observedEnd).toISOString(),
      provider: 'Kraken public OHLC (1 minute)', currency: 'USD',
      paperEligible: false, intervalMinutes: 1, ageSeconds: Math.floor(ageMs / 1000),
    };
  });
}

export async function getClosedCandleSnapshot(fetcher = fetch, now = Date.now()) {
  if (cache && cacheUntil > now) return cache;
  const retrievedAt = new Date(now).toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  // Spot OHLC accepts one pair per request; ticker's comma-separated pair
  // format is not valid here. One failure must not invent a price for the other.
  const bars = await Promise.all(PAIRS.map(async pair => {
    try {
      const response = await fetcher(UPSTREAM + PAIR_REQUESTS[pair.symbol], {
        method: 'GET', signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('ohlc_provider_http_error');
      const document = await response.json();
      if (!document || !Array.isArray(document.error) || document.error.length
        || !document.result || typeof document.result !== 'object') {
        throw new Error('invalid_ohlc_provider_response');
      }
      // Kraken may return the canonical pair key or its documented alias.
      const rows = document.result[pair.kraken]
        ?? document.result[PAIR_REQUESTS[pair.symbol]];
      const normalized = normalizeClosedCandles({
        error: [], result: { [pair.kraken]: rows },
      }, now);
      return normalized.find(bar => bar.symbol === pair.symbol)
        ?? unavailable(pair, 'unavailable');
    } catch {
      return unavailable(pair, 'unavailable');
    }
  }));
  clearTimeout(timer);
  const snapshot = {
    schema: 1, source: 'public_closed_candle_observation', retrievedAt, bars,
    paperExecutionEnabled: false, liveOrdersEnabled: false,
    warning: 'Closed public OHLC bars are research evidence only; do not infer broker fills, executable liquidity or trading authorization.',
  };
  if (bars.some(bar => bar.status === 'recent_closed_candle')) {
    cache = snapshot;
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
  return response.status(200).json(await getClosedCandleSnapshot());
}
