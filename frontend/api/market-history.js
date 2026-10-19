// Fixed-origin, read-only CoinDCX INR historical candles. No broker or orders.
// Restricted to verified market naming convention; unavailable responses stay unavailable.
export const ASSETS = Object.freeze({
  BTCINR: { label: 'Bitcoin', pair: 'I-BTC_INR' },
  ETHINR: { label: 'Ethereum', pair: 'I-ETH_INR' },
  SOLINR: { label: 'Solana', pair: 'I-SOL_INR' },
  XRPINR: { label: 'XRP', pair: 'I-XRP_INR' },
  DOGEINR: { label: 'Dogecoin', pair: 'I-DOGE_INR' },
});
export const RANGES = Object.freeze({
  '1H': { interval:'1m', unit:60000, lookback:60 * 60000 },
  '1D': { interval:'15m', unit:15 * 60000, lookback:24 * 60 * 60000 },
  '1W': { interval:'1h', unit:60 * 60000, lookback:7 * 24 * 60 * 60000 },
  '1M': { interval:'1h', unit:60 * 60000, lookback:30 * 24 * 60 * 60000 },
  '1Y': { interval:'1d', unit:86400000, lookback:366 * 86400000 },
  '5Y': { interval:'1d', unit:86400000, lookback:5 * 366 * 86400000 },
  ALL: { interval:'1d', unit:86400000, lookback:null },
});
const ORIGIN = 'https://api.coindcx.com/market_data/candles';
const MAX_PAGES = 8;
const MAX_BODY_BYTES = 700000;
const FETCH_TIMEOUT_MS = 6500;

export function normalizeCandles(input, { now, unit, start, end }) {
  if (!Array.isArray(input)) throw new Error('invalid candle response');
  if (input.length > 1000) throw new Error('response exceeds candle count bound');
  const points = new Map();
  for (const c of input) {
    if (!c || typeof c !== 'object') continue;
    const time = Number(c.time);
    const open = Number(c.open), high = Number(c.high);
    const low = Number(c.low), close = Number(c.close);
    const volume = Number(c.volume);
    if (!Number.isSafeInteger(time) || time < start || time > end
      || time + unit > now || time <= 0) continue; // exclude unfinished candle
    if (![open, high, low, close, volume].every(Number.isFinite)
      || open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0
      || high < Math.max(open, close) || low > Math.min(open, close)) continue;
    if (points.has(time)) throw new Error('duplicate candle timestamp');
    points.set(time,{ time, open, high, low, close, volume });
  }
  return [...points.values()].sort((a,b)=>a.time-b.time);
}

export function candleRequestWindows(now, range) {
  const cfg = RANGES[range];
  if (!cfg) throw new Error('unknown range');
  // ALL means attempted available provider history, starting 2013. No claim of
  // complete coverage is made if a page fails or provider returns a truncated set.
  const start = cfg.lookback === null
    ? Date.parse('2013-01-01T00:00:00Z') : now - cfg.lookback;
  const windows = [];
  const maxWindow = cfg.unit * 950;
  for(let cursor=start;cursor<now && windows.length<MAX_PAGES;cursor+=maxWindow){
    windows.push({start:cursor, end:Math.min(now,cursor+maxWindow),unit:cfg.unit});
  }
  // ALL: 2013–present in daily windows, up to 8 pages; max coverage 20.8 years.
  return {windows,requestedStart:start,coveredUntil:windows.at(-1)?.end??start,
    coverageCapped:windows.length===MAX_PAGES && (windows.at(-1)?.end??start)<now };
}

async function readArray(response) {
  if(!response.ok)throw Error('candles provider HTTP failure');
  const raw=await response.text();
  if(raw.length>MAX_BODY_BYTES)throw Error('candle payload too large');
  return JSON.parse(raw);
}

export async function getChart({symbol='BTCINR',range='1D'}={},fetcher=fetch,now=Date.now()){
  if (!Object.hasOwn(ASSETS,symbol) || !Object.hasOwn(RANGES,range))
    throw new RangeError('unsupported market or period');
  const {interval,unit}=RANGES[range];
  const {windows,requestedStart,coveredUntil,coverageCapped}=candleRequestWindows(now,range);
  const controller = new AbortController();
  const timer=setTimeout(()=>controller.abort(),FETCH_TIMEOUT_MS);
  let failures=0;
  let points=[];
  try {
    // Bounded sequential requests protect both origin and serverless runtime.
    for(const w of windows) {
      const url=new URL(ORIGIN);
      url.searchParams.set('pair',ASSETS[symbol].pair);
      url.searchParams.set('interval',interval);
      url.searchParams.set('startTime',String(w.start));
      url.searchParams.set('endTime',String(w.end));
      url.searchParams.set('limit','1000');
      try {
        const response=await fetcher(url.toString(),{method:'GET',
          signal:controller.signal,headers:{Accept:'application/json'}});
        const data=await readArray(response);
        const bars=normalizeCandles(data,{now,unit,start:w.start,end:w.end});
        points.push(...bars);
      }catch{
        failures++;
        break; // don't report full history after any failed page
      }
    }
  }finally{clearTimeout(timer);}
  const unique=new Map();
  for(const p of points)unique.set(p.time,p);
  const series=[...unique.values()].sort((a,b)=>a.time-b.time);
  const truncated=coverageCapped||failures>0||coveredUntil<now-2*unit;
  return {
    schema:1,source:'CoinDCX public INR spot candles',currency:'INR',symbol,range,
    interval,generatedAt:new Date(now).toISOString(),
    requestedStart:new Date(requestedStart).toISOString(),
    earliestAvailable:series.length?new Date(series[0].time).toISOString():null,
    latestClosedAt:series.length?new Date(series.at(-1).time+unit).toISOString():null,
    coverage:series.length===0?'unavailable':truncated?'partial':'provider_observations',
    completeHistoryVerified:false,
    // A lack of earlier candles doesn't imply the asset didn't trade earlier.
    warning:truncated?'History incomplete or provider limited; no missing prices interpolated.':
      'Only provider-returned completed spot candles. Trade-execution quality not verified.',
    candles:series.slice(-8000),paperExecutionEnabled:false,realOrdersEnabled:false,
  };
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=55');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
  const query=req.query||{};
  const symbol=typeof query.symbol==='string'?query.symbol:'BTCINR';
  const range=typeof query.range==='string'?query.range:'1D';
  if(!Object.hasOwn(ASSETS,symbol)||!Object.hasOwn(RANGES,range))
    return res.status(400).json({error:'unsupported_market_or_period'});
  try{return res.status(200).json(await getChart({symbol,range}));}
  catch{return res.status(503).json({error:'historical_data_unavailable'});}
}
