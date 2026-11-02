/** Private after-close receipts for the actual complete 09:40 top-volume roster. */
import {validateHistoricalCandles} from './upstox-history-pilot.js';

const BASE='https://api.upstox.com/v3/historical-candle/';
const KEY=/^NSE_EQ\|[A-Z0-9]{8,20}$/;
const fail=reason=>{const e=Error('TOP_VOLUME_HISTORY_BLOCKED: '+reason);e.atlasDiagnostic='top volume history '+reason;throw e;};
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const validDay=day=>typeof day==='string'&&/^\d{4}-\d\d-\d\d$/.test(day)&&Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;

export async function topVolumeRoster(env,day){
 if(!validDay(day)||!env.DB)fail('invalid date or archive');
 const c=await env.DB.prepare('SELECT eligible_count,observed_ms,source FROM coverage WHERE session=?').bind(day).first();
 if(!c||c.eligible_count<500||c.source!=='UPSTOX_ANALYTICS_READONLY_V3')fail('complete live 0940 coverage missing');
 const result=await env.DB.prepare(`SELECT symbol,instrument_key,cumulative_volume,observed_ms,source,
 (SELECT COUNT(*) FROM entry_snapshots WHERE session=?) AS captured
 FROM entry_snapshots WHERE session=? ORDER BY cumulative_volume DESC,symbol ASC LIMIT 10`).bind(day,day).all();
 const top=result.results;
 if(top.length!==10||top[0].captured!==c.eligible_count||top.some(x=>x.source!==c.source||!KEY.test(x.instrument_key)||x.observed_ms>c.observed_ms+2000||c.observed_ms-x.observed_ms>8000))fail('incomplete or unqualified 0940 identity');
 if(new Set(top.map(x=>x.instrument_key)).size!==10)fail('duplicate 0940 top instrument');
 return top;
}

export async function readTopVolumeHistory(env,day){
 const top=await topVolumeRoster(env,day);
 if(!env.HISTORY_DB)fail('private minute archive unavailable');
 const receipts=await env.HISTORY_DB.prepare('SELECT instrument_key,body_sha256,candle_count,known_at_utc FROM history_samples WHERE source_date=?').bind(day).all();
 const byKey=new Map(receipts.results.map(x=>[x.instrument_key,x]));
 return {schema:'atlas.top-volume-history.v1',mode:'PAPER_ONLY',realOrdersEnabled:false,sourceDate:day,
  source:'COMPLETE_LIVE_0940_VOLUME_RANKING',stocks:top.map((x,i)=>({rank:i+1,symbol:x.symbol,instrumentKey:x.instrument_key,
   volumeAt0940:x.cumulative_volume,observedAt:new Date(x.observed_ms).toISOString(),
   archived:byKey.get(x.instrument_key)?.candle_count===375,minuteBars:byKey.get(x.instrument_key)?.candle_count??0,
   sourceSha256:byKey.get(x.instrument_key)?.body_sha256??null,sourceKnownAt:byKey.get(x.instrument_key)?.known_at_utc??null}))};
}

export async function archiveTopVolumeStep(env,scheduledTime,fetcher=fetch,clock=()=>Date.now()){
 const instant=new Date(scheduledTime);
 if(!Number.isFinite(instant.getTime())||instant.getUTCHours()!==13||instant.getUTCMinutes()>9)fail('invalid scheduled slot');
 const day=instant.toISOString().slice(0,10),slot=instant.getUTCMinutes();
 if(clock()<Date.parse(day+'T10:30:00Z'))fail('source session not complete');
 const top=await topVolumeRoster(env,day),chosen=top[slot];
 if(!env.HISTORY_DB||typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100)fail('read-only source or archive unavailable');
 const sameDay=new Date(clock()).toISOString().slice(0,10)===day;
 const dated=BASE+encodeURIComponent(chosen.instrument_key)+'/minutes/1/'+day+'/'+day;
 const intraday=BASE+'intraday/'+encodeURIComponent(chosen.instrument_key)+'/minutes/1';
 const existing=await env.HISTORY_DB.prepare('SELECT source_url,body_sha256,body_bytes,response_body,candle_count,first_minute,last_minute FROM history_samples WHERE instrument_key=? AND source_date=?').bind(chosen.instrument_key,day).first();
 if(existing){
  const bytes=new TextEncoder().encode(existing.response_body);
  if(![dated,intraday].includes(existing.source_url)||bytes.length!==existing.body_bytes||await hash(bytes)!==existing.body_sha256)fail('stored receipt integrity mismatch');
  let parsed;try{parsed=JSON.parse(existing.response_body)}catch{fail('stored receipt JSON mismatch')}
  const proof=validateHistoricalCandles(parsed,day);
  if(proof.candle_count!==375||proof.candle_count!==existing.candle_count||proof.first_minute!==existing.first_minute||proof.last_minute!==existing.last_minute||
   !proof.first_minute.includes('T09:15:')||!proof.last_minute.includes('T15:29:'))fail('stored minute session incomplete');
  return {status:'VERIFIED_EXISTING',sourceDate:day,rank:slot+1,symbol:chosen.symbol,bodySha256:existing.body_sha256,minuteBars:existing.candle_count};
 }
 const url=sameDay?intraday:dated;
 const res=await fetcher(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN,Accept:'application/json'}});
 if(res.status!==200)fail('provider HTTP '+res.status);
 if(!(res.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))fail('provider content type');
 if(Number(res.headers.get('content-length'))>500000)fail('provider response exceeds byte bound');
 const body=await res.text(),bytes=new TextEncoder().encode(body);
 if(bytes.length<50||bytes.length>500000)fail('provider response size');
 let parsed;try{parsed=JSON.parse(body)}catch{fail('invalid provider JSON')}
 const proof=validateHistoricalCandles(parsed,day);
 if(proof.candle_count!==375||!proof.first_minute.includes('T09:15:')||!proof.last_minute.includes('T15:29:'))fail('minute session incomplete');
 const digest=await hash(bytes),knownAt=new Date(clock()).toISOString();
 await env.HISTORY_DB.prepare(`INSERT OR IGNORE INTO history_samples(instrument_key,source_date,source_url,known_at_utc,body_sha256,body_bytes,candle_count,first_minute,last_minute,response_body,evidence_class) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
  .bind(chosen.instrument_key,day,url,knownAt,digest,bytes.length,proof.candle_count,proof.first_minute,proof.last_minute,body,
   'COMPLETE_LIVE_0940_TOP_VOLUME_RANK_'+(slot+1)+';MINUTE_RETRIEVAL_AFTER_SESSION_NOT_LIVE_SIGNAL').run();
 const saved=await env.HISTORY_DB.prepare('SELECT source_url,body_sha256,body_bytes,candle_count FROM history_samples WHERE instrument_key=? AND source_date=?').bind(chosen.instrument_key,day).first();
 if(!saved||saved.source_url!==url||saved.body_sha256!==digest||saved.body_bytes!==bytes.length||saved.candle_count!==375)fail('immutable receipt conflict');
 return {status:'CAPTURED',sourceDate:day,rank:slot+1,symbol:chosen.symbol,bodySha256:digest,minuteBars:375};
}
