/** Owner-only read-only ETF source probe; returns metadata, never prices or credentials. */
const KEYS=Object.freeze({NIFTYBEES:'NSE_EQ|INF204KB14I2',GOLDBEES:'NSE_EQ|INF204KB17I5'});
const fail=reason=>{const e=Error('ETF_SOURCE_BLOCKED: '+reason);e.atlasDiagnostic='ETF source '+reason;throw e;};
export async function verifyEtfSource(env,{day,symbol,kind},fetcher=fetch){
 if(!/^\d{4}-\d\d-\d\d$/.test(day||'')||day<'2025-01-01'||
   day>new Date(Date.now()+19800000).toISOString().slice(0,10)||
   !Object.hasOwn(KEYS,symbol)||!['daily','intraday','actions'].includes(kind)||
   typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100)
   fail('invalid dated read-only source request');
 const key=KEYS[symbol],isin=key.split('|')[1];
 const url=kind==='daily'?`https://api.upstox.com/v3/historical-candle/${encodeURIComponent(key)}/days/1/${day}/2025-01-01`:
  kind==='intraday'?`https://api.upstox.com/v3/historical-candle/intraday/${encodeURIComponent(key)}/days/1`:
  `https://api.upstox.com/v2/fundamentals/${isin}/corporate-actions`;
 const res=await fetcher(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),
  headers:{Authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN,Accept:'application/json'}});
 if(res.redirected||Number(res.headers.get('content-length'))>150000)return {day,symbol,kind,httpStatus:res.status,status:'UNQUALIFIED_SOURCE'};
 const body=await res.text();if(body.length>150000)fail('response exceeds bound');
 let parsed;try{parsed=JSON.parse(body)}catch{return {day,symbol,kind,httpStatus:res.status,status:'UNQUALIFIED_SOURCE'}}
 if(res.status!==200||parsed?.status!=='success')return {day,symbol,kind,httpStatus:res.status,status:'UNQUALIFIED_SOURCE'};
 const values=kind==='actions'?parsed?.data:parsed?.data?.candles;
 if(!Array.isArray(values))fail('official response shape');
 const dates=kind!=='actions'?values.map(x=>x?.[0]?.slice(0,10)).filter(Boolean).sort():[];
 return {day,symbol,kind,httpStatus:res.status,status:'SOURCE_REACHABLE_UNADJUSTED',
  records:values.length,firstDay:dates[0]??null,lastDay:dates.at(-1)??null,
  adjusted:false,realOrdersEnabled:false};
}
