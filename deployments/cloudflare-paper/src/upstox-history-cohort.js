/** Bounded fixed-watchlist cohort. Only listed ROSTERS have dated MIS proof. */
import {validateHistoricalCandles} from './upstox-history-pilot.js';

const BASE='https://api.upstox.com/v3/historical-candle/';
const MAX_BYTES=500000;
const IDENTITIES=Object.freeze({
 AXISBANK:'NSE_EQ|INE238A01034',BHARTIARTL:'NSE_EQ|INE397D01024',
 HDFCBANK:'NSE_EQ|INE040A01034',ICICIBANK:'NSE_EQ|INE090A01021',
 INFY:'NSE_EQ|INE009A01021',ITC:'NSE_EQ|INE154A01025',
 NHPC:'NSE_EQ|INE848E01016',RELIANCE:'NSE_EQ|INE002A01018',
 SBIN:'NSE_EQ|INE062A01020',TCS:'NSE_EQ|INE467B01029',
});
const ROSTERS=Object.freeze({
 '2026-10-28':'30fc46b263c61879cb4ab76c8a582796dd17f6227660480256163ff0f97fc834',
 '2026-10-29':'b5cd4d7ece5c474540b89c0e6fe413635e60c1b4fae660d20b76b43c7b7ebb75',
 '2026-10-30':'5d578fbb8a378ad81e1b064fc6983e39da0572d3015b08cd842479633edd49be',
});
export const COHORT_SYMBOLS=Object.freeze(Object.keys(IDENTITIES));
const hex=bytes=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
const sha256=async bytes=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
const fail=reason=>{const e=Error('HISTORY_COHORT_BLOCKED: '+reason);e.atlasDiagnostic='history cohort '+reason;throw e;};

export function cohortSpec(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
  typeof input.source_date!=='string'||typeof input.symbol!=='string')fail('invalid request');
 const day=input.source_date,symbol=input.symbol,key=IDENTITIES[symbol];
 if(!/^\d{4}-\d\d-\d\d$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||
  new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day||day<'2026-09-24'||
  !Object.hasOwn(IDENTITIES,symbol)||!key)fail('invalid dated cohort');
 const roster=Object.hasOwn(ROSTERS,day)?ROSTERS[day]:null;
 return {day,symbol,key,roster,url:BASE+encodeURIComponent(key)+'/minutes/1/'+day+'/'+day,
  intradayUrl:BASE+'intraday/'+encodeURIComponent(key)+'/minutes/1'};
}

export async function archiveHistoryCohort(env,input,fetcher=fetch,clock=()=>Date.now()){
 const spec=cohortSpec(input),now=clock();
 if(now<Date.parse(spec.day+'T10:30:00Z'))fail('source session not complete');
 // Upstox documents a separate endpoint for the current trading day. Older
 // sessions use the dated historical endpoint. Both receipts remain immutable.
 const sameUtcDay=new Date(now).toISOString().slice(0,10)===spec.day;
 const sourceUrl=sameUtcDay?spec.intradayUrl:spec.url;
 if(!env.HISTORY_DB||typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100)fail('read-only source or archive unavailable');
 const db=env.HISTORY_DB;
 const old=await db.prepare('SELECT source_url,body_sha256,body_bytes,candle_count,first_minute,last_minute,known_at_utc,response_body,evidence_class FROM history_samples WHERE instrument_key=? AND source_date=?').bind(spec.key,spec.day).first();
 if(old){
  const bytes=new TextEncoder().encode(old.response_body);
  if(![spec.url,spec.intradayUrl].includes(old.source_url)||bytes.length!==old.body_bytes||await sha256(bytes)!==old.body_sha256)fail('stored receipt integrity mismatch');
  return {status:'VERIFIED_EXISTING',symbol:spec.symbol,instrument_key:spec.key,source_date:spec.day,
   roster_sha256:spec.roster,body_sha256:old.body_sha256,body_bytes:old.body_bytes,
   candle_count:old.candle_count,first_minute:old.first_minute,last_minute:old.last_minute,
   known_at_utc:old.known_at_utc,evidence_class:old.evidence_class};
 }
 const res=await fetcher(sourceUrl,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),
  headers:{Authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN,Accept:'application/json'}});
 if(res.status!==200)fail('provider HTTP '+res.status);
 if(!(res.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))fail('provider content type');
 const stated=Number(res.headers.get('content-length'));
 if(Number.isFinite(stated)&&stated>MAX_BYTES)fail('provider response exceeds byte bound');
 const body=await res.text(),bytes=new TextEncoder().encode(body);
 if(bytes.length<50||bytes.length>MAX_BYTES)fail('provider response size');
 let parsed;try{parsed=JSON.parse(body)}catch{fail('invalid provider JSON')}
 const validated=validateHistoricalCandles(parsed,spec.day);
 const hash=await sha256(bytes),knownAt=new Date(clock()).toISOString();
 const evidence=(sameUtcDay?'INTRADAY_PROVIDER_RETRIEVAL_AFTER_SESSION_NOT_LIVE_0940;':
  'HISTORICAL_PROVIDER_RETRIEVAL_AFTER_SESSION_NOT_LIVE_0940;')+
  (spec.roster?'PREMARKET_ROSTER_SHA256='+spec.roster:'FIXED_WATCHLIST_IDENTITY_ONLY_NO_DATED_ROSTER');
 await db.prepare('INSERT OR IGNORE INTO history_samples(instrument_key,source_date,source_url,known_at_utc,body_sha256,body_bytes,candle_count,first_minute,last_minute,response_body,evidence_class) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
  .bind(spec.key,spec.day,sourceUrl,knownAt,hash,bytes.length,validated.candle_count,validated.first_minute,validated.last_minute,body,evidence).run();
 const saved=await db.prepare('SELECT source_url,body_sha256,body_bytes,candle_count FROM history_samples WHERE instrument_key=? AND source_date=?').bind(spec.key,spec.day).first();
 if(!saved||saved.source_url!==sourceUrl||saved.body_sha256!==hash||saved.body_bytes!==bytes.length||saved.candle_count!==validated.candle_count)fail('immutable receipt conflict');
 return {status:'CAPTURED',symbol:spec.symbol,instrument_key:spec.key,source_date:spec.day,
  roster_sha256:spec.roster,body_sha256:hash,body_bytes:bytes.length,
  candle_count:validated.candle_count,first_minute:validated.first_minute,last_minute:validated.last_minute,
  known_at_utc:knownAt,evidence_class:evidence};
}

export async function readHistoryCohort(env,day=null){
 if(!env.HISTORY_DB)fail('archive unavailable');
 if(day!==null&&(!/^\d{4}-\d\d-\d\d$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||
  new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day||day<'2026-09-24'))fail('invalid cohort date');
 const dates=day?[day]:Object.keys(ROSTERS);
 const results=await env.HISTORY_DB.prepare('SELECT instrument_key,source_date,body_sha256,body_bytes,candle_count,first_minute,last_minute,known_at_utc,evidence_class FROM history_samples WHERE source_date IN ('+dates.map(()=>'?').join(',')+') ORDER BY source_date,instrument_key LIMIT ?').bind(...dates,dates.length*COHORT_SYMBOLS.length).all();
 return {status:'PILOT_ONLY',source_date:day,roster_sha256:day?(ROSTERS[day]||null):null,
  expected_symbol_days:dates.length*COHORT_SYMBOLS.length,archived_symbol_days:results.results.length,samples:results.results};
}

/** One dated symbol per Cron invocation, after the cash session is complete. */
export async function archiveScheduledCohortStep(env,scheduledTime,fetcher=fetch,clock=()=>Date.now()){
 const instant=new Date(scheduledTime);
 if(!Number.isFinite(instant.getTime())||![11,13].includes(instant.getUTCHours())||instant.getUTCMinutes()>9)fail('invalid scheduled slot');
 const day=instant.toISOString().slice(0,10),symbol=COHORT_SYMBOLS[instant.getUTCMinutes()];
 return archiveHistoryCohort(env,{source_date:day,symbol},fetcher,clock);
}
