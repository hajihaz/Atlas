/** Captures completed one-minute OHLCV bars for the 09:40 top ten in cloud. */
import {topVolumeRoster} from './top-volume-history.js';

const SOURCE_URL='https://api.upstox.com/v3/market-quote/ohlc';
const fail=reason=>{const e=Error('LIVE_MINUTE_BLOCKED: '+reason);e.atlasDiagnostic='live minute '+reason;throw e;};
const dayOf=now=>new Date(now+19800000).toISOString().slice(0,10);
const minuteOf=now=>{const d=new Date(now+19800000);return d.getUTCHours()*60+d.getUTCMinutes()};
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');

export function normalizeCompletedBars(payload,top,now){
 if(payload?.status!=='success'||!payload.data||typeof payload.data!=='object'||Object.keys(payload.data).length!==10)fail('incomplete source response');
 const expected=now-now%60000-60000,byKey=new Map();
 for(const [name,value] of Object.entries(payload.data)){
  const key=value?.instrument_token;
  if(typeof name!=='string'||typeof key!=='string'||byKey.has(key))fail('duplicate source identity');
  byKey.set(key,value?.prev_ohlc);
 }
 const bars=[];
 for(const stock of top){
  const b=byKey.get(stock.instrument_key);
  if(!b||b.ts!==expected||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||
   b.open<=0||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||
   b.volume<0||!Number.isSafeInteger(b.volume))fail('stale or invalid completed bar');
  bars.push([stock.symbol,stock.instrument_key,b.open,b.high,b.low,b.close,b.volume]);
 }
 if(byKey.size!==bars.length)fail('source roster mismatch');
 return {barMs:expected,bars};
}

async function readTopRoster(env,day,now){
 const db=env.HISTORY_DB;
 let saved=await db.prepare('SELECT known_at_ms,roster_sha256,roster_json FROM live_top_roster WHERE source_date=?').bind(day).first();
 if(!saved){
  const top=await topVolumeRoster(env,day);
  const compact=top.map(x=>({symbol:x.symbol,instrument_key:x.instrument_key,volume:x.cumulative_volume}));
  const json=JSON.stringify(compact),sha=await digest(new TextEncoder().encode(json));
  await db.prepare('INSERT OR IGNORE INTO live_top_roster(source_date,known_at_ms,roster_sha256,roster_json) VALUES(?,?,?,?)')
   .bind(day,Math.max(...top.map(x=>x.observed_ms)),sha,json).run();
  saved=await db.prepare('SELECT known_at_ms,roster_sha256,roster_json FROM live_top_roster WHERE source_date=?').bind(day).first();
  if(!saved||saved.roster_sha256!==sha||saved.roster_json!==json)fail('concurrent roster changed');
 }
 if(saved.known_at_ms>=Date.parse(day+'T04:11:00Z')||saved.known_at_ms>now||
  await digest(new TextEncoder().encode(saved.roster_json))!==saved.roster_sha256)fail('roster timing or hash changed');
 let top;try{top=JSON.parse(saved.roster_json)}catch{fail('invalid stored roster')}
 if(!Array.isArray(top)||top.length!==10||new Set(top.map(x=>x.symbol)).size!==10||
  new Set(top.map(x=>x.instrument_key)).size!==10||top.some(x=>
   !/^[A-Z][A-Z0-9]{0,19}$/.test(x.symbol)||!/^NSE_EQ\|[A-Z0-9]{8,20}$/.test(x.instrument_key)||
   !Number.isSafeInteger(x.volume)||x.volume<0))fail('stored roster identity invalid');
 return top;
}

export async function captureLiveMinute(env,now=Date.now(),fetcher=fetch,clock=()=>Date.now()){
 const minute=minuteOf(now),day=dayOf(now);
 if(minute<581||minute>915)return {status:'OUTSIDE_WINDOW'};
 if(!env.HISTORY_DB||!env.DB||typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100)fail('private archive or read only source unavailable');
 const barMs=now-now%60000-60000,db=env.HISTORY_DB;
 const top=await readTopRoster(env,day,now),keys=top.map(x=>x.instrument_key);
 const u=new URL(SOURCE_URL);u.searchParams.set('instrument_key',keys.join(','));u.searchParams.set('interval','I1');
 const requestUrl=u.toString();
 const prior=await db.prepare('SELECT bar_ms,known_at_ms,source_url,body_sha256,bars_json FROM live_minute_receipts WHERE source_date=? AND bar_ms=?').bind(day,barMs).first();
 if(prior){
  if(prior.bar_ms!==barMs||prior.known_at_ms<barMs+60000||prior.source_url!==requestUrl||
   await digest(new TextEncoder().encode(prior.bars_json))!==prior.body_sha256)fail('stored receipt changed');
  return {status:'VERIFIED_EXISTING',sourceDate:day,barMs,stocks:10,sha256:prior.body_sha256};
 }
 const res=await fetcher(requestUrl,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(7000),
  headers:{Authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN,Accept:'application/json'}});
 if(!res.ok||res.redirected||Number(res.headers.get('content-length'))>30000)fail('official source HTTP or size');
 const raw=await res.text();if(raw.length>30000)fail('official source body too large');
 let payload;try{payload=JSON.parse(raw)}catch{fail('invalid official source JSON')}
 const known=clock();if(dayOf(known)!==day||known<barMs+60000||known-now>10000||now-known>10000)fail('source receipt outside minute');
 const normalized=normalizeCompletedBars(payload,top,now),barsJson=JSON.stringify(normalized.bars),sha256=await digest(new TextEncoder().encode(barsJson));
 await db.prepare('INSERT OR IGNORE INTO live_minute_receipts(source_date,bar_ms,known_at_ms,source_url,body_sha256,bars_json) VALUES(?,?,?,?,?,?)')
  .bind(day,barMs,known,requestUrl,sha256,barsJson).run();
 const saved=await db.prepare('SELECT bar_ms,known_at_ms,source_url,body_sha256,bars_json FROM live_minute_receipts WHERE source_date=? AND bar_ms=?').bind(day,barMs).first();
 if(!saved||saved.bar_ms!==barMs||saved.known_at_ms!==known||saved.source_url!==requestUrl||saved.body_sha256!==sha256||saved.bars_json!==barsJson)fail('concurrent or changed receipt');
 return {status:'CAPTURED',sourceDate:day,barMs,stocks:10,sha256};
}

export async function readLiveMinuteStatus(env,day){
 if(!/^\d{4}-\d\d-\d\d$/.test(day||'')||!env.HISTORY_DB)fail('invalid date or archive');
 const row=await env.HISTORY_DB.prepare('SELECT COUNT(*) AS minutes,MIN(bar_ms) AS first_bar_ms,MAX(bar_ms) AS last_bar_ms,MAX(known_at_ms) AS latest_known_ms FROM live_minute_receipts WHERE source_date=?').bind(day).first();
 return {schema:'atlas.live-minute-status.v1',mode:'PAPER_ONLY',realOrdersEnabled:false,sourceDate:day,
  minutes:row?.minutes??0,firstBarAt:row?.first_bar_ms?new Date(row.first_bar_ms).toISOString():null,
  lastBarAt:row?.last_bar_ms?new Date(row.last_bar_ms).toISOString():null,
  latestKnownAt:row?.latest_known_ms?new Date(row.latest_known_ms).toISOString():null,
  note:'Completed OHLCV source bars; no strategy signal or paper fill is implied.'};
}

/** One actual top-ten stock per separate 09:42–10:01 cloud invocation. */
export async function captureOpeningSeed(env,scheduledTime,fetcher=fetch,clock=()=>Date.now()){
 const at=new Date(scheduledTime);
 if(!Number.isFinite(at.getTime())||at.getUTCHours()!==4||at.getUTCMinutes()<12||at.getUTCMinutes()>31)fail('invalid opening seed slot');
 const day=at.toISOString().slice(0,10),slot=(at.getUTCMinutes()-12)%10,now=clock();
 if(dayOf(now)!==day||now<at.getTime()||now-at.getTime()>60000||!env.HISTORY_DB||
  typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100)fail('opening seed source unavailable');
 const top=await readTopRoster(env,day,now),stock=top[slot],db=env.HISTORY_DB;
 const sourceUrl='https://api.upstox.com/v3/historical-candle/intraday/'+encodeURIComponent(stock.instrument_key)+'/minutes/1';
 const old=await db.prepare('SELECT * FROM live_opening_seed WHERE source_date=? AND instrument_key=?').bind(day,stock.instrument_key).first();
 if(old){
  if(old.symbol!==stock.symbol||old.source_url!==sourceUrl||old.body_bytes!==new TextEncoder().encode(old.response_body).length||
   await digest(new TextEncoder().encode(old.response_body))!==old.body_sha256)fail('stored opening seed changed');
  return {status:'VERIFIED_EXISTING',sourceDate:day,symbol:stock.symbol,sourceSha256:old.body_sha256,bars:25};
 }
 const res=await fetcher(sourceUrl,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),
  headers:{Authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN,Accept:'application/json'}});
 if(!res.ok||res.redirected||Number(res.headers.get('content-length'))>500000)fail('opening seed provider HTTP or size');
 const body=await res.text(),bytes=new TextEncoder().encode(body);
 if(bytes.length<100||bytes.length>500000)fail('opening seed body size');
 let parsed;try{parsed=JSON.parse(body)}catch{fail('opening seed JSON')}
 if(parsed?.status!=='success'||!Array.isArray(parsed?.data?.candles))fail('opening seed source shape');
 const byTime=new Map();for(const c of parsed.data.candles){if(!Array.isArray(c)||typeof c[0]!=='string'||byTime.has(c[0]))fail('opening seed duplicate or invalid candle');byTime.set(c[0],c)}
 const bars=[];for(let i=0;i<25;i++){
  const stamp=new Date(Date.parse(day+'T03:45:00Z')+19800000+i*60000).toISOString().slice(11,16);
  const c=byTime.get(day+'T'+stamp+':00+05:30');
  if(!c||![c[1],c[2],c[3],c[4],c[5]].every(Number.isFinite)||c[1]<=0||
   c[2]<Math.max(c[1],c[4])||c[3]>Math.min(c[1],c[4])||
   !Number.isSafeInteger(c[5])||c[5]<0)fail('opening seed incomplete or invalid');
  bars.push([Date.parse(c[0]),c[1],c[2],c[3],c[4],c[5]]);
 }
 const known=clock();if(dayOf(known)!==day||known<now||known-now>10000)fail('opening seed receipt late');
 const sha=await digest(bytes),json=JSON.stringify(bars);
 await db.prepare('INSERT OR IGNORE INTO live_opening_seed(source_date,instrument_key,symbol,known_at_ms,source_url,body_sha256,body_bytes,response_body,bars_json) VALUES(?,?,?,?,?,?,?,?,?)')
  .bind(day,stock.instrument_key,stock.symbol,known,sourceUrl,sha,bytes.length,body,json).run();
 const saved=await db.prepare('SELECT instrument_key,symbol,known_at_ms,source_url,body_sha256,body_bytes,bars_json FROM live_opening_seed WHERE source_date=? AND instrument_key=?').bind(day,stock.instrument_key).first();
 if(!saved||saved.instrument_key!==stock.instrument_key||saved.symbol!==stock.symbol||saved.known_at_ms!==known||
  saved.source_url!==sourceUrl||saved.body_sha256!==sha||saved.body_bytes!==bytes.length||saved.bars_json!==json)fail('opening seed concurrent change');
 return {status:'CAPTURED',sourceDate:day,symbol:stock.symbol,sourceSha256:sha,bars:25};
}
