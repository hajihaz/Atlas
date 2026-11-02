/** Current-session Nifty opening candles, captured before the 09:40 selection. */
import {validateHistoricalCandles} from './upstox-history-pilot.js';
const KEY='NSE_INDEX|Nifty 50';
const URL='https://api.upstox.com/v3/historical-candle/intraday/'+encodeURIComponent(KEY)+'/minutes/1';
const OHLC_URL='https://api.upstox.com/v3/market-quote/ohlc?instrument_key='+encodeURIComponent(KEY)+'&interval=I1';
const fail=reason=>{const e=Error('NIFTY_OPEN_BLOCKED: '+reason);e.atlasDiagnostic='nifty open '+reason;throw e;};
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const dayOf=now=>new Date(now+19800000).toISOString().slice(0,10);
const minuteOf=now=>{const d=new Date(now+19800000);return d.getUTCHours()*60+d.getUTCMinutes()};
const validDay=day=>typeof day==='string'&&/^\d{4}-\d\d-\d\d$/.test(day)&&Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;

function opening(body,day){
 const proof=validateHistoricalCandles(body,day);
 const bars=body.data.candles.slice().sort((a,b)=>a[0].localeCompare(b[0])).filter(c=>c[0].slice(11,16)<='09:29');
 if(bars.length!==15||bars[0][0]!==day+'T09:15:00+05:30'||bars.at(-1)[0]!==day+'T09:29:00+05:30')fail('opening fifteen minute window incomplete');
 for(let i=0;i<15;i++)if(Date.parse(bars[i][0])!==Date.parse(day+'T03:45:00Z')+i*60000)fail('opening minute gap');
 return {proof,bars:bars.map(c=>({time:Date.parse(c[0]),open:c[1],high:c[2],low:c[3],close:c[4],volume:c[5]}))};
}

export async function archiveNiftyOpen(env,now=Date.now(),fetcher=fetch,clock=()=>Date.now()){
 const day=dayOf(now),minute=minuteOf(now);
 if(minute<571||minute>579||!env.HISTORY_DB||typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100)fail('current predecision capture unavailable');
 const db=env.HISTORY_DB;
 const previous=await db.prepare('SELECT * FROM nifty_open_receipts WHERE source_date=?').bind(day).first();
 if(previous){
  const bytes=new TextEncoder().encode(previous.response_body);
  if(previous.source_url!==URL||previous.body_bytes!==bytes.length||await digest(bytes)!==previous.body_sha256)fail('stored receipt integrity mismatch');
  let parsed;try{parsed=JSON.parse(previous.response_body)}catch{fail('stored response JSON')}
  const {proof,bars}=opening(parsed,day);
  if(proof.candle_count!==previous.candle_count||Date.parse(previous.known_at_utc)>=Date.parse(day+'T04:10:00Z'))fail('stored receipt timing mismatch');
  return {status:'VERIFIED_EXISTING',sourceDate:day,knownAt:previous.known_at_utc,sourceSha256:previous.body_sha256,bars};
 }
 const res=await fetcher(URL,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(7000),headers:{Authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN,Accept:'application/json'}});
 if(res.status!==200)fail('provider HTTP '+res.status);
 if(!(res.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))fail('provider content type');
 if(Number(res.headers.get('content-length'))>500000)fail('provider response exceeds byte bound');
 const body=await res.text(),bytes=new TextEncoder().encode(body);
 if(bytes.length<50||bytes.length>500000)fail('provider response size');
 let parsed;try{parsed=JSON.parse(body)}catch{fail('invalid provider JSON')}
 const {proof,bars}=opening(parsed,day),known=clock();
 if(dayOf(known)!==day||minuteOf(known)>=580)fail('response arrived after 0940 decision');
 const hash=await digest(bytes);
 await db.prepare('INSERT OR IGNORE INTO nifty_open_receipts(source_date,source_url,known_at_utc,body_sha256,body_bytes,candle_count,response_body,evidence_class) VALUES(?,?,?,?,?,?,?,?)')
  .bind(day,URL,new Date(known).toISOString(),hash,bytes.length,proof.candle_count,body,'LIVE_PRE0940_NIFTY_0915_0929').run();
 const saved=await db.prepare('SELECT body_sha256,body_bytes,candle_count,known_at_utc FROM nifty_open_receipts WHERE source_date=?').bind(day).first();
 if(!saved||saved.body_sha256!==hash||saved.body_bytes!==bytes.length||saved.candle_count!==proof.candle_count)fail('immutable receipt conflict');
 return {status:'CAPTURED',sourceDate:day,knownAt:saved.known_at_utc,sourceSha256:hash,bars};
}

export async function readNiftyOpen(env,day){
 if(!validDay(day)||!env.HISTORY_DB)fail('invalid date or private archive');
 const row=await env.HISTORY_DB.prepare('SELECT * FROM nifty_open_receipts WHERE source_date=?').bind(day).first();
 if(!row)fail('dated opening receipt missing');
 const bytes=new TextEncoder().encode(row.response_body);
 if(row.source_url!==URL||row.body_bytes!==bytes.length||await digest(bytes)!==row.body_sha256||
  !Number.isFinite(Date.parse(row.known_at_utc))||Date.parse(row.known_at_utc)>=Date.parse(day+'T04:10:00Z'))fail('source identity hash or timing mismatch');
 let parsed;try{parsed=JSON.parse(row.response_body)}catch{fail('stored response JSON')}
 const {proof,bars}=opening(parsed,day);
 if(proof.candle_count!==row.candle_count)fail('stored response metadata mismatch');
 return {schema:'atlas.nifty-open.v1',mode:'PAPER_ONLY',realOrdersEnabled:false,sourceDate:day,
  instrumentKey:KEY,sourceSha256:row.body_sha256,sourceKnownAt:row.known_at_utc,bars};
}

/** One owner-only read-only source probe for a completed date; no prices leave Atlas. */
export async function verifyNiftyHistoricalSource(env,day,fetcher=fetch,clock=()=>Date.now()){
 if(!validDay(day)||Date.parse(day+'T10:30:00Z')>=clock()||
  typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100)fail('completed dated source unavailable');
 const url='https://api.upstox.com/v3/historical-candle/'+encodeURIComponent(KEY)+'/minutes/1/'+day+'/'+day;
 const res=await fetcher(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN,Accept:'application/json'}});
 if(res.status!==200)fail('dated provider HTTP '+res.status);
 if(!(res.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))fail('dated provider content type');
 if(Number(res.headers.get('content-length'))>500000)fail('dated provider response too large');
 const body=await res.text();if(body.length>500000)fail('dated provider response too large');
 let parsed;try{parsed=JSON.parse(body)}catch{fail('dated provider JSON')}
 const candles=parsed?.data?.candles;
 if(parsed?.status!=='success'||!Array.isArray(candles))fail('dated provider response shape');
 const first=candles.at(-1)?.[0],last=candles[0]?.[0];
 const shape={mode:'PAPER_ONLY',realOrdersEnabled:false,readOnly:true,sourceDate:day,
  instrumentKey:KEY,candleCount:candles.length,
  firstMinute:typeof first==='string'&&first.startsWith(day)?first:null,
  lastMinute:typeof last==='string'&&last.startsWith(day)?last:null,
  volumeType:typeof candles[0]?.[5]};
 try{const proof=validateHistoricalCandles(parsed,day);
  return {...shape,valid:true,candleCount:proof.candle_count,firstMinute:proof.first_minute,lastMinute:proof.last_minute};
 }catch{return {...shape,valid:false}}
}

export async function verifyNiftyOhlcSource(env,fetcher=fetch){
 if(typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100)fail('read-only source unavailable');
 const res=await fetcher(OHLC_URL,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(7000),headers:{Authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN,Accept:'application/json'}});
 if(res.status!==200)fail('OHLC provider HTTP '+res.status);
 if(!(res.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))fail('OHLC provider content type');
 if(Number(res.headers.get('content-length'))>100000)fail('OHLC provider response too large');
 const text=await res.text();if(text.length>100000)fail('OHLC provider response too large');
 let body;try{body=JSON.parse(text)}catch{fail('OHLC provider JSON')}
 const item=body?.data?.['NSE_INDEX:Nifty 50']??body?.data?.[KEY];
 const candle=item?.prev_ohlc;
 return {mode:'PAPER_ONLY',realOrdersEnabled:false,readOnly:true,providerStatus:body?.status==='success'?'SUCCESS':'OTHER',
  instrumentMatched:item?.instrument_token===KEY,previousMinutePresent:!!candle,
  previousMinuteTime:Number.isSafeInteger(candle?.ts)&&Number.isFinite(new Date(candle.ts).getTime())?new Date(candle.ts).toISOString():null,
  previousMinuteShape:candle?['open','high','low','close','volume'].every(k=>Number.isFinite(candle[k])):false};
}
