/** Immutable, owner-only 120-calendar-day Upstox daily candle receipt. */
import {COHORT_SYMBOLS,cohortSpec} from './upstox-history-cohort.js';
const BASE='https://api.upstox.com/v3/historical-candle/';
const MAX_BYTES=120000,MIN_BARS=61;
const fail=reason=>{const e=Error('DAILY_COHORT_BLOCKED: '+reason);e.atlasDiagnostic='daily cohort '+reason;throw e;};
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const hash=async bytes=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
function sourceDay(day){try{cohortSpec({source_date:day,symbol:COHORT_SYMBOLS[0]})}catch{fail('invalid source date')}return day;}
export function dailySpec(day,symbol){
 sourceDay(day);let identity;try{identity=cohortSpec({source_date:day,symbol})}catch{fail('invalid symbol')}
 const from=new Date(Date.parse(day+'T00:00:00Z')-122*86400000).toISOString().slice(0,10);
 return {day,symbol,key:identity.key,roster:identity.roster,from,
  url:BASE+encodeURIComponent(identity.key)+'/days/1/'+day+'/'+from,
  intradayUrl:BASE+'intraday/'+encodeURIComponent(identity.key)+'/days/1'};
}
export function validateDailyCandles(parsed,spec){
 if(parsed?.status!=='success'||!Array.isArray(parsed?.data?.candles))fail('provider response shape');
 const candles=parsed.data.candles;
 if(candles.length<MIN_BARS||candles.length>123)fail('incomplete daily history');
 const seen=new Set();let first='',last='';
 for(const c of candles){
  if(!Array.isArray(c)||c.length<6||typeof c[0]!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+05:30$/.test(c[0]))fail('daily timestamp');
  const day=c[0].slice(0,10),[open,high,low,close,volume]=c.slice(1,6);
  if(day<spec.from||day>spec.day||seen.has(day)||!Number.isFinite(Date.parse(c[0]))||
    ![open,high,low,close].every(x=>Number.isFinite(x)&&x>0)||
    high<Math.max(open,close,low)||low>Math.min(open,close,high)||
    !Number.isSafeInteger(volume)||volume<0)fail('daily identity or OHLCV');
  seen.add(day);if(!first||day<first)first=day;if(!last||day>last)last=day;
 }
 if(last!==spec.day)fail('latest completed session absent');
 return {count:candles.length,first,last};
}
export function dailyFeatures(parsed){
 const bars=[...parsed.data.candles].sort((a,b)=>a[0].localeCompare(b[0]));
 if(bars.length<61)fail('feature warmup');
 const last=bars.at(-1)[4],weekBase=bars.at(-6)[4],monthBase=bars.at(-21)[4];
 const avg=n=>bars.slice(-n).reduce((sum,b)=>sum+b[4],0)/n;
 return {weekly_return_bps:Math.round((last/weekBase-1)*10000),
  monthly_return_bps:Math.round((last/monthBase-1)*10000),
  weekly_eligible:Number(last>avg(10)&&last>weekBase),
  monthly_eligible:Number(last>avg(60)&&last>monthBase)};
}
async function verify(row,spec){
 if(!row||row.instrument_key!==spec.key||row.source_date!==spec.day||row.source_url!==spec.url||
   typeof row.response_body!=='string'||!/^[a-f0-9]{64}$/.test(row.body_sha256)||
   !Number.isFinite(Date.parse(row.known_at_utc)))fail('stored identity');
 const bytes=new TextEncoder().encode(row.response_body);
 if(bytes.length!==row.body_bytes||await hash(bytes)!==row.body_sha256)fail('stored receipt hash');
 let parsed;try{parsed=JSON.parse(row.response_body)}catch{fail('stored source JSON')}
 let sourceReceipts=null;
 if(parsed.source_receipts!==undefined){
  const pair=parsed.source_receipts;
  if(!Array.isArray(pair)||pair.length!==2||pair[0].kind!=='historical'||pair[1].kind!=='intraday'||
    pair[0].url!==spec.url||pair[1].url!==spec.intradayUrl)fail('stored source pair identity');
  const originals=[];
  for(const item of pair){
   if(typeof item.body!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256)||
     new TextEncoder().encode(item.body).length!==item.bytes||
     await hash(new TextEncoder().encode(item.body))!==item.sha256)fail('stored original source hash');
   let source;try{source=JSON.parse(item.body)}catch{fail('stored original source JSON')}
   if(source?.status!=='success'||!Array.isArray(source?.data?.candles))fail('stored original source shape');
   originals.push(source.data.candles);
  }
  if(originals[1].length!==1||originals[1][0]?.[0]?.slice(0,10)!==spec.day||
    originals[0].some(c=>c?.[0]?.slice(0,10)>=spec.day)||
    JSON.stringify([...originals[0],...originals[1]])!==JSON.stringify(parsed.data?.candles))fail('stored source combination');
  sourceReceipts=pair.map(({kind,url,sha256,bytes})=>({kind,url,sha256,bytes}));
 }
 const proof=validateDailyCandles(parsed,spec);
 if(proof.count!==row.candle_count||proof.first!==row.first_day||proof.last!==row.last_day)fail('stored metadata');
 const features=dailyFeatures(parsed);
 if(Object.entries(features).some(([key,value])=>row[key]!==value))fail('stored feature mismatch');
 return {status:'VERIFIED_EXISTING',source_date:spec.day,symbol:spec.symbol,instrument_key:spec.key,
   roster_sha256:spec.roster,body_sha256:row.body_sha256,body_bytes:row.body_bytes,
   candle_count:proof.count,first_day:proof.first,last_day:proof.last,known_at_utc:row.known_at_utc,
   source_receipts:sourceReceipts,
   evidence_class:sourceReceipts?'RETROSPECTIVE_COMBINED_HISTORICAL_AND_INTRADAY_DAILY':'RETROSPECTIVE_DAILY_PROVIDER_RETRIEVAL'};
}
export async function archiveDailyCohort(env,input,fetcher=fetch,clock=()=>Date.now()){
 const spec=dailySpec(input?.source_date,input?.symbol),now=clock();
 if(now<Date.parse(spec.day+'T10:30:00Z'))fail('session not complete');
 if(!env.HISTORY_DB||typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100)fail('read only source unavailable');
 const db=env.HISTORY_DB,query='SELECT * FROM daily_history_samples WHERE instrument_key=? AND source_date=?';
 const old=await db.prepare(query).bind(spec.key,spec.day).first();
 if(old)return verify(old,spec);
 const fetchSource=async url=>{
  const res=await fetcher(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),
   headers:{Authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN,Accept:'application/json'}});
  if(res.status!==200||(res.headers.get('content-type')||'').toLowerCase().startsWith('application/json')===false)fail('provider status or content type');
  const body=await res.text(),bytes=new TextEncoder().encode(body);
  if(bytes.length<50||bytes.length>MAX_BYTES)fail('source body size');
  let parsed;try{parsed=JSON.parse(body)}catch{fail('source JSON')}
  if(parsed?.status!=='success'||!Array.isArray(parsed?.data?.candles))fail('provider response shape');
  return {body,bytes,parsed};
 };
 const historical=await fetchSource(spec.url);
 let body=historical.body,parsed=historical.parsed;
 if(!parsed.data.candles.some(c=>c?.[0]?.slice(0,10)===spec.day)){
  if(new Date(now).toISOString().slice(0,10)!==spec.day)fail('dated daily source missing completed session');
  const histDays=parsed.data.candles.map(c=>c?.[0]?.slice(0,10)).sort();
  const lastHistory=histDays.at(-1);
  if(!lastHistory||lastHistory>=spec.day||
    Date.parse(spec.day+'T00:00:00Z')-Date.parse(lastHistory+'T00:00:00Z')>4*86400000)fail('historical daily source gap');
  const today=await fetchSource(spec.intradayUrl);
  if(today.parsed.data.candles.length!==1||today.parsed.data.candles[0]?.[0]?.slice(0,10)!==spec.day)fail('current daily bar absent');
  const pair=[
   {kind:'historical',url:spec.url,sha256:await hash(historical.bytes),bytes:historical.bytes.length,body:historical.body},
   {kind:'intraday',url:spec.intradayUrl,sha256:await hash(today.bytes),bytes:today.bytes.length,body:today.body},
  ];
  parsed={status:'success',data:{candles:[...parsed.data.candles,...today.parsed.data.candles]},source_receipts:pair};
  body=JSON.stringify(parsed);
 }
 const bytes=new TextEncoder().encode(body);
 if(bytes.length>2*MAX_BYTES+10000)fail('combined source body size');
 const proof=validateDailyCandles(parsed,spec),features=dailyFeatures(parsed),bodyHash=await hash(bytes),knownAt=new Date(clock()).toISOString();
 await db.prepare('INSERT OR IGNORE INTO daily_history_samples(instrument_key,source_date,source_url,known_at_utc,body_sha256,body_bytes,candle_count,first_day,last_day,response_body,weekly_return_bps,monthly_return_bps,weekly_eligible,monthly_eligible) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .bind(spec.key,spec.day,spec.url,knownAt,bodyHash,bytes.length,proof.count,proof.first,proof.last,body,features.weekly_return_bps,features.monthly_return_bps,features.weekly_eligible,features.monthly_eligible).run();
 const saved=await db.prepare(query).bind(spec.key,spec.day).first();
 if(!saved||saved.body_sha256!==bodyHash||saved.body_bytes!==bytes.length)fail('immutable receipt conflict');
 return {...await verify(saved,spec),status:'CAPTURED'};
}
export async function readDailyCohort(env,day){
 sourceDay(day);if(!env.HISTORY_DB)fail('archive unavailable');
 const result=await env.HISTORY_DB.prepare('SELECT instrument_key,source_date,known_at_utc,body_sha256,body_bytes,candle_count,first_day,last_day,weekly_return_bps,monthly_return_bps,weekly_eligible,monthly_eligible FROM daily_history_samples WHERE source_date=? ORDER BY instrument_key LIMIT 10').bind(day).all();
 return {status:result.results.length===10?'COMPLETE':'INCOMPLETE',source_date:day,expected:10,
  archived:result.results.length,receipts:result.results};
}
/** Owner-only, one-source GET diagnostic; no stored write or candle values. */
export async function verifyDailySource(env,{day,symbol,kind},fetcher=fetch){
 const spec=dailySpec(day,symbol);
 if(!['historical','intraday'].includes(kind))fail('invalid source kind');
 if(typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100)fail('read only source unavailable');
 const url=kind==='historical'?spec.url:BASE+'intraday/'+encodeURIComponent(spec.key)+'/days/1';
 const response=await fetcher(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),
  headers:{Authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN,Accept:'application/json'}});
 const status=response.status,contentType=(response.headers.get('content-type')||'').toLowerCase();
 if(status!==200||!contentType.startsWith('application/json'))
  return {source_date:day,symbol,kind,http_status:status,content_type:contentType,readOnly:true,realOrdersEnabled:false};
 const body=await response.text(),bytes=new TextEncoder().encode(body);
 if(bytes.length<10||bytes.length>MAX_BYTES)fail('diagnostic source body size');
 let parsed;try{parsed=JSON.parse(body)}catch{fail('diagnostic source JSON')}
 const candles=parsed?.data?.candles;
 if(parsed?.status!=='success'||!Array.isArray(candles))fail('diagnostic source shape');
 const dates=candles.map(c=>typeof c?.[0]==='string'?c[0].slice(0,10):'').sort();
 return {source_date:day,symbol,kind,http_status:status,content_type:contentType,
  candle_count:candles.length,first_day:dates[0]||null,last_day:dates.at(-1)||null,
  includes_source_day:dates.includes(day),body_bytes:bytes.length,readOnly:true,realOrdersEnabled:false};
}
export async function scheduledDailyCohortStep(env,scheduledTime,fetcher=fetch,clock=()=>Date.now()){
 const time=new Date(scheduledTime);
 if(!Number.isFinite(time.getTime())||time.getUTCHours()!==12||time.getUTCMinutes()>9)fail('invalid daily slot');
 return archiveDailyCohort(env,{source_date:time.toISOString().slice(0,10),symbol:COHORT_SYMBOLS[time.getUTCMinutes()]},fetcher,clock);
}
