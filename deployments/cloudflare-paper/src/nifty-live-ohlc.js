/** Two completed, live Nifty one-minute candles known before 09:40. */
const KEY='NSE_INDEX|Nifty 50',URL='https://api.upstox.com/v3/market-quote/ohlc?instrument_key='+encodeURIComponent(KEY)+'&interval=I1';
const TARGETS={556:'09:15',570:'09:29'};
const fail=reason=>{const e=Error('NIFTY_LIVE_OHLC_BLOCKED: '+reason);e.atlasDiagnostic='nifty live OHLC '+reason;throw e;};
const dayOf=now=>new Date(now+19800000).toISOString().slice(0,10);
const minuteOf=now=>{const d=new Date(now+19800000);return d.getUTCHours()*60+d.getUTCMinutes()};
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const validDay=day=>typeof day==='string'&&/^\d{4}-\d\d-\d\d$/.test(day)&&Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
function candle(body,day,target){
 const item=body?.status==='success'&&(body.data?.['NSE_INDEX:Nifty 50']??body.data?.[KEY]);
 if(!item||item.instrument_token!==KEY)fail('Nifty instrument identity mismatch');
 const c=item.prev_ohlc,expected=Date.parse(day+'T03:45:00Z')+(target==='09:29'?14:0)*60000;
 if(!c||!Number.isSafeInteger(c.ts)||c.ts!==expected||
  ![c.open,c.high,c.low,c.close].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0)||
  c.high<Math.max(c.open,c.close,c.low)||c.low>Math.min(c.open,c.close,c.high)||
  !Number.isSafeInteger(c.volume)||c.volume<0)fail('completed Nifty one minute candle missing');
 return {time:c.ts,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume};
}
async function verified(row,day,target){
 const bytes=new TextEncoder().encode(row.response_body);
 if(row.source_date!==day||row.target_minute!==target||row.source_url!==URL||bytes.length!==row.body_bytes||await digest(bytes)!==row.body_sha256||
  !Number.isFinite(Date.parse(row.known_at_utc))||dayOf(Date.parse(row.known_at_utc))!==day||
  minuteOf(Date.parse(row.known_at_utc))!==(target==='09:15'?556:570))fail('stored source identity hash or timing mismatch');
 let parsed;try{parsed=JSON.parse(row.response_body)}catch{fail('stored source JSON mismatch')}
 return candle(parsed,day,target);
}
export async function archiveNiftyLiveOhlc(env,now=Date.now(),fetcher=fetch,clock=()=>Date.now()){
 const minute=minuteOf(now),target=TARGETS[minute],day=dayOf(now);
 if(!target||!env.HISTORY_DB||typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100)fail('capture slot or read-only source unavailable');
 const db=env.HISTORY_DB,prior=await db.prepare('SELECT * FROM nifty_open_ohlc_receipts WHERE source_date=? AND target_minute=?').bind(day,target).first();
 if(prior){const bar=await verified(prior,day,target);return {status:'VERIFIED_EXISTING',sourceDate:day,targetMinute:target,sourceKnownAt:prior.known_at_utc,sourceSha256:prior.body_sha256,bar}}
 const response=await fetcher(URL,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(7000),headers:{Authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN,Accept:'application/json'}});
 if(response.status!==200)fail('provider HTTP '+response.status);
 if(!(response.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))fail('provider content type');
 if(Number(response.headers.get('content-length'))>100000)fail('provider response too large');
 const body=await response.text(),bytes=new TextEncoder().encode(body);
 if(bytes.length<50||bytes.length>100000)fail('provider response size');
 let parsed;try{parsed=JSON.parse(body)}catch{fail('provider JSON invalid')}
 const bar=candle(parsed,day,target),known=clock();
 if(dayOf(known)!==day||minuteOf(known)!==minute)fail('response outside source minute');
 const sha=await digest(bytes);
 await db.prepare('INSERT OR IGNORE INTO nifty_open_ohlc_receipts(source_date,target_minute,source_url,known_at_utc,body_sha256,body_bytes,response_body) VALUES(?,?,?,?,?,?,?)')
  .bind(day,target,URL,new Date(known).toISOString(),sha,bytes.length,body).run();
 const saved=await db.prepare('SELECT * FROM nifty_open_ohlc_receipts WHERE source_date=? AND target_minute=?').bind(day,target).first();
 if(!saved||saved.body_sha256!==sha||saved.body_bytes!==bytes.length)fail('immutable receipt conflict');
 return {status:'CAPTURED',sourceDate:day,targetMinute:target,sourceKnownAt:saved.known_at_utc,sourceSha256:sha,bar};
}
export async function readNiftyOpening(env,day){
 if(!validDay(day)||!env.HISTORY_DB)fail('invalid date or private archive');
 const rows=await env.HISTORY_DB.prepare('SELECT * FROM nifty_open_ohlc_receipts WHERE source_date=? ORDER BY target_minute').bind(day).all();
 if(rows.results.length!==2)fail('both completed opening candles required');
 const bars=[];for(const [i,target] of ['09:15','09:29'].entries()){
  const row=rows.results[i];if(!row||row.target_minute!==target)fail('opening identity mismatch');
  bars.push({...await verified(row,day,target),sourceKnownAt:row.known_at_utc,sourceSha256:row.body_sha256});
 }
 return {schema:'atlas.nifty-opening.v1',mode:'PAPER_ONLY',realOrdersEnabled:false,sourceDate:day,instrumentKey:KEY,bars};
}
