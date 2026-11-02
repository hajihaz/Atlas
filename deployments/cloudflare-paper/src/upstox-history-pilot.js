/** Read-only, fixed-scope historical source pilot. No broker order endpoints. */
const DAY='2026-10-29';
const KEY='NSE_EQ|INE848E01016'; // NHPC, documented Upstox instrument key.
const URL='https://api.upstox.com/v3/historical-candle/'+encodeURIComponent(KEY)+'/minutes/1/'+DAY+'/'+DAY;
const MAX_BYTES=500000;
const CLASS='HISTORICAL_PROVIDER_RETRIEVAL_AFTER_SESSION_NOT_LIVE_0940';
const fail=reason=>{throw Error('HISTORY_PILOT_BLOCKED: '+reason);};
const hex=bytes=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
async function sha256(bytes){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));}

export function validateHistoricalCandles(body,day=DAY){
 if(body?.status!=='success'||!Array.isArray(body?.data?.candles))fail('provider response shape');
 const candles=body.data.candles;
 if(candles.length<1||candles.length>390)fail('candle count outside daily bound');
 const seen=new Set();let first='',last='';
 for(const c of candles){
  if(!Array.isArray(c)||c.length<6)fail('invalid candle shape');
  const stamp=c[0];
  if(typeof stamp!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:00\+05:30$/.test(stamp)||stamp.slice(0,10)!==day)fail('invalid dated candle timestamp');
  const clock=stamp.slice(11,16);
  if(clock<'09:15'||clock>'15:29'||seen.has(stamp))fail('duplicate or out-of-session minute');
  seen.add(stamp);
  const [open,high,low,close,volume]=c.slice(1,6);
  if(![open,high,low,close].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0)||
    high<Math.max(open,close,low)||low>Math.min(open,close,high)||
    !Number.isSafeInteger(volume)||volume<0)fail('invalid OHLCV');
  if(!first||stamp<first)first=stamp;
  if(!last||stamp>last)last=stamp;
 }
 return {candle_count:candles.length,first_minute:first,last_minute:last};
}

export async function archiveHistoryPilot(env,fetcher=fetch,clock=()=>Date.now()){
 if(!env.HISTORY_DB||typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100)fail('read-only source or archive unavailable');
 const db=env.HISTORY_DB;
 const old=await db.prepare('SELECT body_sha256,body_bytes,candle_count,first_minute,last_minute,known_at_utc,response_body FROM history_samples WHERE instrument_key=? AND source_date=?').bind(KEY,DAY).first();
 if(old){
  const bytes=new TextEncoder().encode(old.response_body);
  if(bytes.length!==old.body_bytes||await sha256(bytes)!==old.body_sha256)fail('stored receipt integrity mismatch');
  return {status:'VERIFIED_EXISTING',instrument_key:KEY,source_date:DAY,body_sha256:old.body_sha256,body_bytes:old.body_bytes,candle_count:old.candle_count,first_minute:old.first_minute,last_minute:old.last_minute,known_at_utc:old.known_at_utc,evidence_class:CLASS};
 }
 const res=await fetcher(URL,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN,Accept:'application/json'}});
 if(res.status!==200)fail('provider HTTP '+res.status);
 const type=res.headers.get('content-type')||'';
 if(!type.toLowerCase().startsWith('application/json'))fail('provider content type');
 const stated=Number(res.headers.get('content-length'));
 if(Number.isFinite(stated)&&stated>MAX_BYTES)fail('response exceeds byte bound');
 const body=await res.text();
 const bytes=new TextEncoder().encode(body);
 if(bytes.length<50||bytes.length>MAX_BYTES)fail('response body size');
 let parsed;try{parsed=JSON.parse(body)}catch{fail('invalid provider JSON')}
 const validated=validateHistoricalCandles(parsed);
 const hash=await sha256(bytes);
 const knownAt=new Date(clock()).toISOString();
 await db.prepare('INSERT OR IGNORE INTO history_samples(instrument_key,source_date,source_url,known_at_utc,body_sha256,body_bytes,candle_count,first_minute,last_minute,response_body,evidence_class) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
  .bind(KEY,DAY,URL,knownAt,hash,bytes.length,validated.candle_count,validated.first_minute,validated.last_minute,body,CLASS).run();
 const saved=await db.prepare('SELECT body_sha256,body_bytes,candle_count,first_minute,last_minute,known_at_utc FROM history_samples WHERE instrument_key=? AND source_date=?').bind(KEY,DAY).first();
 if(!saved||saved.body_sha256!==hash||saved.body_bytes!==bytes.length||saved.candle_count!==validated.candle_count)fail('immutable receipt conflict');
 return {status:'CAPTURED',instrument_key:KEY,source_date:DAY,body_sha256:hash,body_bytes:bytes.length,candle_count:validated.candle_count,first_minute:validated.first_minute,last_minute:validated.last_minute,known_at_utc:knownAt,evidence_class:CLASS};
}

export async function readHistoryPilot(env){
 if(!env.HISTORY_DB)fail('archive unavailable');
 const row=await env.HISTORY_DB.prepare('SELECT instrument_key,source_date,body_sha256,body_bytes,candle_count,first_minute,last_minute,known_at_utc,evidence_class FROM history_samples WHERE instrument_key=? AND source_date=?').bind(KEY,DAY).first();
 return row?{status:'CAPTURED',...row}:{status:'MISSING',instrument_key:KEY,source_date:DAY};
}
