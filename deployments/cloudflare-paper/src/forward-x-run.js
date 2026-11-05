/** Cloud-only forward X source decision journal; settlement uses a separate later quote. */
import {readNiftyOpening} from './nifty-live-ohlc.js';
import {forwardXDecision} from './forward-x-decision.js';
import {runForwardVwap,recordVwapSkip} from './forward-vwap.js';

const fail=reason=>{const e=Error('FORWARD_X_RUN_BLOCKED: '+reason);e.atlasDiagnostic='forward X run '+reason;throw e;};
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const dayOf=now=>new Date(now+19800000).toISOString().slice(0,10);
const minuteOf=now=>{const d=new Date(now+19800000);return d.getUTCHours()*60+d.getUTCMinutes()};
const sourceUrl=keys=>{const url=new URL('https://api.upstox.com/v3/market-quote/ohlc');url.searchParams.set('instrument_key',keys.join(','));url.searchParams.set('interval','I1');return url.toString()};

async function inputForWindow(env,day,windowEnd,now){
 const db=env.HISTORY_DB,rr=await db.prepare('SELECT known_at_ms,roster_sha256,roster_json FROM live_top_roster WHERE source_date=?').bind(day).first();
 if(!rr||rr.known_at_ms>=Date.parse(day+'T04:11:00Z')||rr.known_at_ms>now||await digest(rr.roster_json)!==rr.roster_sha256)fail('dated 0940 roster missing');
 let top;try{top=JSON.parse(rr.roster_json)}catch{fail('dated roster JSON')}
 if(!Array.isArray(top)||top.length!==10||new Set(top.map(x=>x.instrument_key)).size!==10||
  top.some(x=>x.eligibleCount!==top[0].eligibleCount||!Number.isSafeInteger(x.eligibleCount)||x.eligibleCount<500))fail('top ten identities incomplete');
 const keys=top.map(x=>x.instrument_key),url=sourceUrl(keys),seeds=await db.prepare('SELECT instrument_key,symbol,known_at_ms,source_url,body_sha256,bars_json FROM live_opening_seed WHERE source_date=?').bind(day).all();
 if(seeds.results.length!==10)fail('opening seed incomplete');
 const seedMap=new Map();for(const s of seeds.results){
  if(!keys.includes(s.instrument_key)||s.symbol!==top.find(x=>x.instrument_key===s.instrument_key)?.symbol||
   s.known_at_ms>now||!s.source_url.endsWith(encodeURIComponent(s.instrument_key)+'/minutes/1')||
   !/^[a-f0-9]{64}$/.test(s.body_sha256)||seedMap.has(s.instrument_key))fail('opening seed identity changed');
  let bars;try{bars=JSON.parse(s.bars_json)}catch{fail('opening seed JSON')}
  if(!Array.isArray(bars)||bars.length!==25)fail('opening seed bars incomplete');
  seedMap.set(s.instrument_key,bars.map(b=>({time:b[0],open:b[1],high:b[2],low:b[3],close:b[4],volume:b[5]})));
 }
 const start=windowEnd-4*60000,receipts=await db.prepare('SELECT bar_ms,known_at_ms,source_url,body_sha256,bars_json FROM live_minute_receipts WHERE source_date=? AND bar_ms BETWEEN ? AND ? ORDER BY bar_ms').bind(day,start,windowEnd).all();
 if(receipts.results.length!==5)fail('five completed live minutes missing');
 const windows=new Map(keys.map(k=>[k,[]]));for(const [i,r] of receipts.results.entries()){
  if(r.bar_ms!==start+i*60000||r.known_at_ms<r.bar_ms+60000||r.known_at_ms>now||r.source_url!==url||
   await digest(r.bars_json)!==r.body_sha256)fail('live minute receipt changed');
  let bars;try{bars=JSON.parse(r.bars_json)}catch{fail('live minute JSON')}
  if(!Array.isArray(bars)||bars.length!==10)fail('live minute roster incomplete');
  for(let n=0;n<10;n++){
   const b=bars[n];if(b?.[0]!==top[n].symbol||b?.[1]!==keys[n])fail('live minute stock identity changed');
   windows.get(keys[n]).push({time:r.bar_ms,open:b[2],high:b[3],low:b[4],close:b[5],volume:b[6],
    sourceSha256:r.body_sha256,knownAt:r.known_at_ms});
  }
 }
 const nifty=(await readNiftyOpening(env,day)).bars.map(x=>({...x,knownAt:Date.parse(x.sourceKnownAt)}));
 return {top,seedMap,windows,nifty,roster:{day,eligibleCount:top[0].eligibleCount,knownAt:rr.known_at_ms,
  top:top.map(x=>({symbol:x.symbol,volume:x.volume}))}};
}

export async function runForwardX(env,scheduledTime,clock=()=>Date.now()){
 const scheduled=new Date(scheduledTime),now=clock();
 if(!Number.isFinite(scheduled.getTime())||!env.HISTORY_DB||dayOf(now)!==dayOf(scheduled.getTime())||
  minuteOf(now)<596||minuteOf(now)>906||minuteOf(now)%5!==1||
  now<scheduled.getTime()||now-scheduled.getTime()>60000)fail('outside forward decision slot');
 const day=dayOf(now),windowEnd=now-now%60000-120000,db=env.HISTORY_DB;
 const prior=await db.prepare('SELECT status,reason FROM live_x_runs WHERE source_date=? AND window_end_ms=?').bind(day,windowEnd).first();
 if(prior){
  if(prior.status==='EVALUATED')try{await runForwardVwap(env,day,windowEnd,now,await inputForWindow(env,day,windowEnd,now));}catch(e){await recordVwapSkip(env,day,windowEnd,now,e);}
  return {status:'VERIFIED_EXISTING',sourceDate:day,windowEnd,runStatus:prior.status};
 }
 let input;
 try{input=await inputForWindow(env,day,windowEnd,now)}catch(e){
  if(typeof e?.atlasDiagnostic!=='string')throw e;
  await db.prepare("INSERT OR IGNORE INTO live_x_runs(source_date,window_end_ms,completed_ms,status,reason) VALUES(?,?,?,'SKIPPED','MISSING_OR_INVALID_POINT_IN_TIME_SOURCE')")
   .bind(day,windowEnd,now).run();
  return {status:'SKIPPED',sourceDate:day,windowEnd,reason:'MISSING_OR_INVALID_POINT_IN_TIME_SOURCE'};
 }
 const decisions=input.top.map(stock=>forwardXDecision({day,symbol:stock.symbol,roster:input.roster,
  seed:input.seedMap.get(stock.instrument_key),window:input.windows.get(stock.instrument_key),nifty:input.nifty,now}));
 try{await runForwardVwap(env,day,windowEnd,now,input);}catch(e){await recordVwapSkip(env,day,windowEnd,now,e);}
 const encoded=JSON.stringify(decisions.map((d,i)=>({symbol:d.symbol,instrumentKey:input.top[i].instrument_key,
  status:d.status,side:d.side??null,reason:d.reason,decision:d})));
 await db.batch([
  db.prepare(`INSERT OR IGNORE INTO live_x_decisions(source_date,window_end_ms,symbol,instrument_key,status,side,reason,decision_json)
   SELECT ?,?,json_extract(value,'$.symbol'),json_extract(value,'$.instrumentKey'),json_extract(value,'$.status'),
   json_extract(value,'$.side'),json_extract(value,'$.reason'),json_extract(value,'$.decision') FROM json_each(?)`).bind(day,windowEnd,encoded),
  db.prepare("INSERT OR IGNORE INTO live_x_runs(source_date,window_end_ms,completed_ms,status,reason) VALUES(?,?,?,'EVALUATED','COMPLETED_SOURCE_BARS')").bind(day,windowEnd,now)
 ]);
 const count=await db.prepare('SELECT COUNT(*) AS n FROM live_x_decisions WHERE source_date=? AND window_end_ms=?').bind(day,windowEnd).first();
 if(count?.n!==10)fail('decision journal incomplete');
 return {status:'EVALUATED',sourceDate:day,windowEnd,signals:decisions.filter(x=>x.status==='SIGNAL').length,noTrade:decisions.filter(x=>x.status==='NO_TRADE').length,
  paperFills:0,realOrdersEnabled:false};
}

export async function readForwardX(env,day){
 if(!/^\d{4}-\d\d-\d\d$/.test(day||'')||!env.HISTORY_DB)fail('invalid date or journal');
 const [runs,decisions,counts]=await Promise.all([
  env.HISTORY_DB.prepare('SELECT window_end_ms,completed_ms,status,reason FROM live_x_runs WHERE source_date=? ORDER BY window_end_ms DESC LIMIT 70').bind(day).all(),
  env.HISTORY_DB.prepare('SELECT window_end_ms,symbol,instrument_key,status,side,reason FROM live_x_decisions WHERE source_date=? ORDER BY window_end_ms DESC,symbol LIMIT 20').bind(day).all(),
  env.HISTORY_DB.prepare('SELECT status,COUNT(*) AS n FROM live_x_decisions WHERE source_date=? GROUP BY status').bind(day).all()
 ]);
 return {schema:'atlas.forward-x-journal.v1',mode:'PAPER_ONLY',realOrdersEnabled:false,sourceDate:day,
  runs:runs.results,summary:Object.fromEntries(counts.results.map(x=>[x.status,x.n])),decisions:decisions.results,
  warning:'This route records completed-bar decisions only. Use the strategy journal and account for later virtual fills and P/L.'};
}
