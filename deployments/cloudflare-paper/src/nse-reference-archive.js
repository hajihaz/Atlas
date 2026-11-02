/** Private, exact-byte official NSE daily reference capture on Cloudflare Free.
 * Only owner-authenticated metadata is returned; raw market-data bytes stay in KV.
 */
const BASE='https://nsearchives.nseindia.com/content/cm/';
const MAX_BYTES=1800000;
const START='2026-09-24';
const fail=reason=>{const e=Error('NSE_REFERENCE_BLOCKED: '+reason);e.atlasDiagnostic='NSE reference '+reason;throw e;};
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const digest=async bytes=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
function validDay(day){
 if(typeof day!=='string'||!/^\d{4}-\d\d-\d\d$/.test(day)||
  !Number.isFinite(Date.parse(day+'T00:00:00Z'))||
  new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day||day<START)fail('invalid source date');
 return day;
}
export function nseReferenceSpec(day,kind){
 validDay(day);
 if(!['eod','master'].includes(kind))fail('invalid source kind');
 const compact=day.replaceAll('-','');
 const name=kind==='eod'?`BhavCopy_NSE_CM_0_0_0_${compact}_F_0000.csv.zip`:
  `NSE_CM_security_${day.slice(8,10)}${day.slice(5,7)}${day.slice(0,4)}.csv.gz`;
 return {day,kind,url:BASE+name,contentType:kind==='eod'?'application/zip':'application/gzip'};
}
function hasMagic(bytes,kind){
 return kind==='eod'?bytes[0]===0x50&&bytes[1]===0x4b&&bytes[2]===0x03&&bytes[3]===0x04:
  bytes[0]===0x1f&&bytes[1]===0x8b;
}
function publicReceipt(saved,status,verified){
 return {status,source_date:saved.source_date,kind:saved.kind,
  source_url:saved.source_url,source_last_modified:saved.source_last_modified,
  received_at_utc:saved.received_at_utc,body_sha256:saved.body_sha256,
  body_bytes:saved.body_bytes,integrity_verified:verified,raw_body_exposed:false};
}
async function receipt(db,day,kind){
 return db.prepare('SELECT source_date,kind,source_url,source_last_modified,received_at_utc,body_sha256,body_bytes,kv_key FROM nse_reference_receipts WHERE source_date=? AND kind=?').bind(day,kind).first();
}
async function checkStored(env,spec,saved){
 if(saved.source_url!==spec.url||saved.kv_key!==`nse-reference/${spec.day}/${spec.kind}/${saved.body_sha256}`||
  !/^[a-f0-9]{64}$/.test(saved.body_sha256)||saved.body_bytes<100||saved.body_bytes>MAX_BYTES||
  !Number.isFinite(Date.parse(saved.source_last_modified))||!Number.isFinite(Date.parse(saved.received_at_utc)))
  fail('manifest integrity mismatch');
 const raw=await env.NSE_REFERENCE_ARCHIVE.get(saved.kv_key,'arrayBuffer');
 if(!(raw instanceof ArrayBuffer))fail('stored body missing');
 const bytes=new Uint8Array(raw);
 if(bytes.length!==saved.body_bytes||!hasMagic(bytes,spec.kind)||await digest(bytes)!==saved.body_sha256)
  fail('stored body integrity mismatch');
 return publicReceipt(saved,'VERIFIED_EXISTING',true);
}
export async function verifyNseReference(env,day,kind){
 const spec=nseReferenceSpec(day,kind);
 if(!env.HISTORY_DB||!env.NSE_REFERENCE_ARCHIVE)fail('private archive unavailable');
 const saved=await receipt(env.HISTORY_DB,day,kind);
 return saved?checkStored(env,spec,saved):{status:'MISSING',source_date:day,kind,raw_body_exposed:false};
}
export async function archiveNseReference(env,input,fetcher=fetch,clock=()=>Date.now(),verifyExisting=true){
 const spec=nseReferenceSpec(input?.day,input?.kind),start=clock();
 if(spec.day>=new Date(start).toISOString().slice(0,10))fail('source date not complete');
 if(!env.HISTORY_DB||!env.NSE_REFERENCE_ARCHIVE)fail('private archive unavailable');
 const db=env.HISTORY_DB,old=await receipt(db,spec.day,spec.kind);
 if(old)return verifyExisting?checkStored(env,spec,old):publicReceipt(old,'ALREADY_RECORDED_UNVERIFIED_THIS_RUN',false);
 const response=await fetcher(spec.url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(9000),
  headers:{Accept:spec.contentType,'User-Agent':'AtlasPrivateResearch/1.0'}});
 if(response.status!==200)fail(spec.kind+' source HTTP '+response.status);
 const declared=Number(response.headers.get('content-length'));
 if(Number.isFinite(declared)&&declared>MAX_BYTES)fail('source body exceeds free archive bound');
 const modified=Date.parse(response.headers.get('last-modified')||'');
 if(!Number.isFinite(modified)||modified>clock()+120000)fail('source publication time invalid');
 const raw=await response.arrayBuffer(),bytes=new Uint8Array(raw);
 if(bytes.length<100||bytes.length>MAX_BYTES||!hasMagic(bytes,spec.kind))fail('source body or format invalid');
 const hash=await digest(bytes),received=new Date(clock()).toISOString();
 const key=`nse-reference/${spec.day}/${spec.kind}/${hash}`;
 const existing=await env.NSE_REFERENCE_ARCHIVE.get(key,'arrayBuffer');
 if(existing){
  const present=new Uint8Array(existing);
  if(present.length!==bytes.length||await digest(present)!==hash)fail('immutable KV key conflict');
 }else await env.NSE_REFERENCE_ARCHIVE.put(key,bytes,{metadata:{source_date:spec.day,kind:spec.kind,sha256:hash}});
 await db.prepare('INSERT OR IGNORE INTO nse_reference_receipts(source_date,kind,source_url,source_last_modified,received_at_utc,body_sha256,body_bytes,kv_key) VALUES(?,?,?,?,?,?,?,?)')
  .bind(spec.day,spec.kind,spec.url,new Date(modified).toISOString(),received,hash,bytes.length,key).run();
 const saved=await receipt(db,spec.day,spec.kind);
 if(!saved||saved.kv_key!==key||saved.body_sha256!==hash||saved.body_bytes!==bytes.length)fail('manifest race or mismatch');
 return publicReceipt(saved,'CAPTURED',true);
}
/** Seven one-minute morning slots per source, covering weekends/holidays without false receipts. */
export async function scheduledNseReferenceStep(env,scheduledTime,fetcher=fetch,clock=()=>Date.now()){
 const time=new Date(scheduledTime);
 if(!Number.isFinite(time.getTime())||![2,3].includes(time.getUTCHours())||time.getUTCMinutes()>6)fail('invalid reference slot');
 const target=new Date(Date.UTC(time.getUTCFullYear(),time.getUTCMonth(),time.getUTCDate()-time.getUTCMinutes()-1));
 if([0,6].includes(target.getUTCDay()))return {status:'CLOSED_WEEKEND_SKIPPED',source_date:target.toISOString().slice(0,10)};
 return archiveNseReference(env,{day:target.toISOString().slice(0,10),kind:time.getUTCHours()===2?'eod':'master'},fetcher,clock,false);
}
