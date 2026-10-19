// INR-only read-only market observations. Prices are provider references, not executable fills.
const PAIRS = Object.freeze([
  { symbol: 'BTC/INR', path: 'BTC-INR', label: 'Bitcoin' },
  { symbol: 'ETH/INR', path: 'ETH-INR', label: 'Ethereum' },
]);
const NSE_SYMBOLS = Object.freeze(['RELIANCE', 'TCS', 'INFY']);
const COINBASE = 'https://api.coinbase.com/v2/prices/';
const NSE_2026_HOLIDAYS = new Set([
  '2026-01-15','2026-01-26','2026-03-03','2026-03-26','2026-03-31',
  '2026-04-03','2026-04-14','2026-05-01','2026-05-28','2026-06-26',
  '2026-09-14','2026-10-02','2026-10-20','2026-11-10','2026-11-24','2026-12-25',
]);
let saved = null;
let savedUntil = 0;

export function nseSessionAt(timestampMs) {
  const date = new Date(timestampMs);
  if (!Number.isFinite(timestampMs) || !Number.isFinite(date.getTime())) throw new TypeError('invalid time');
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map(x => [x.type, x.value]));
  const day = parts.year + '-' + parts.month + '-' + parts.day;
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const weekend = parts.weekday === 'Sat' || parts.weekday === 'Sun';
  let phase = 'closed';
  if (weekend) phase = 'weekend';
  else if (parts.year !== '2026') phase = 'calendar_unverified';
  else if (NSE_2026_HOLIDAYS.has(day)) phase = 'scheduled_holiday';
  else if (minute < 540) phase = 'before_preopen';
  else if (minute < 555) phase = 'preopen';
  else if (minute < 930) phase = 'scheduled_regular_hours';
  return { exchange: 'NSE', date: day, timeIST: parts.hour + ':' + parts.minute + ' IST',
    phase, timezone: 'Asia/Kolkata', regularHoursIST: '09:15–15:30',
    exchangeVerifiedOpen: false, holidayCalendarYear: 2026 };
}

export function parseIndicativeINR(payload, pair, retrievedAt) {
  const amount = payload?.data?.amount;
  const price = typeof amount === 'string' ? Number(amount) : NaN;
  if (payload?.data?.currency !== 'INR' || !Number.isFinite(price) || price <= 0)
    throw new Error('invalid INR source amount');
  return { symbol: pair.symbol, label: pair.label, market: 'crypto', currency: 'INR',
    price, provider: 'Coinbase public spot reference', retrievedAt,
    observedAt: null, status: 'indicative_reference_time_unverified', paperEligible: false };
}

function unavailable(pair, retrievedAt) {
  return { symbol: pair.symbol, label: pair.label, market: 'crypto', currency: 'INR',
    price: null, provider: 'Coinbase public spot reference', retrievedAt,
    observedAt: null, status: 'unavailable', paperEligible: false };
}

export async function getINRSnapshot(fetcher = fetch, now = Date.now()) {
  if (saved && savedUntil > now) return saved;
  const retrievedAt = new Date(now).toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);
  try {
    const crypto = await Promise.all(PAIRS.map(async pair => {
      try {
        const result = await fetcher(COINBASE + pair.path + '/spot', {
          method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal,
        });
        if (!result.ok) throw new Error('price upstream error');
        return parseIndicativeINR(await result.json(), pair, retrievedAt);
      } catch { return unavailable(pair, retrievedAt); }
    }));
    const snapshot = {
      schema: 1, quoteCurrency: 'INR', source: 'provider_backed_inr_observation',
      retrievedAt, providerStatus: crypto.some(row => row.price !== null)
        ? 'indicative_reference' : 'unavailable',
      crypto,
      equities: NSE_SYMBOLS.map(symbol => ({
        symbol: symbol + '/INR', market: 'equity', currency: 'INR', price: null,
        provider: 'NSE authorised quote feed not connected',
        observedAt: null, status: 'authenticated_feed_required', paperEligible: false,
      })),
      nse: nseSessionAt(now),
      realPortfolio: { valueINR: null, pnlINR: null, tradesVerified: null,
        status: 'no_authenticated_portfolio_or_paper_ledger' },
      paperExecutionEnabled: false, liveOrdersEnabled: false,
      warning: 'Indicative INR crypto references. No verified trade timestamp, NSE feed or broker balances.',
    };
    if (crypto.some(x => x.price !== null)) { saved = snapshot; savedUntil = now + 30000; }
    return snapshot;
  } finally { clearTimeout(timer); }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(200).json(await getINRSnapshot());
}
