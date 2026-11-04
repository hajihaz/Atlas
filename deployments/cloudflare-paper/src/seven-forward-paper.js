/** Source-qualified ScalpStorm X virtual settlement. This module has no broker route. */
import {loadSevenAccount,saveSevenAccount} from './seven-paper-store.js';
import {submitSevenSignal,settleSevenPending,sevenRiskExit,SEVEN_RISK_POLICY} from './seven-paper-ledger.js';

const STRATEGY='scalpstorm_x';
const fail=reason=>{const e=Error('SEVEN_FORWARD_BLOCKED: '+reason);e.atlasDiagnostic='seven forward '+reason;throw e;};
const dayOf=ms=>new Date(ms+19800000).toISOString().slice(0,10);
const minuteOf=ms=>{const d=new Date(ms+19800000);return d.getUTCHours()*60+d.getUTCMinutes()};
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');

/** Attach only already-persisted, point-in-time X decisions to the independent account. */
export async function queueForwardX(env,day,windowEnd,now){
 if(!env.DB||!env.HISTORY_DB||day!==dayOf(now)||!Number.isSafeInteger(windowEnd)||
   minuteOf(now)<581||minuteOf(now)>=SEVEN_RISK_POLICY.entryCutoffMinute)fail('decision slot or store');
 const run=await env.HISTORY_DB.prepare('SELECT status FROM live_x_runs WHERE source_date=? AND window_end_ms=?')
  .bind(day,windowEnd).first();
 if(run?.status!=='EVALUATED')return {status:'SOURCE_NOT_QUALIFIED',queued:0};
 const result=await env.HISTORY_DB.prepare("SELECT symbol,instrument_key,side,decision_json FROM live_x_decisions WHERE source_date=? AND window_end_ms=? AND status='SIGNAL' ORDER BY symbol")
  .bind(day,windowEnd).all();
 let state=await loadSevenAccount(env.DB,STRATEGY);
 if(!state)fail('account missing');
 const initial=state,statuses=[];
 for(const row of result.results){
  let decision;try{decision=JSON.parse(row.decision_json)}catch{fail('decision JSON changed')}
  if(decision?.strategyId!==STRATEGY||decision?.sourceDate!==day||decision.symbol!==row.symbol||
    decision.status!=='SIGNAL'||decision.side!==row.side||
    !/^NSE_EQ\|INE[A-Z0-9]{9}$/.test(row.instrument_key)||
    !Array.isArray(decision.sourceSha256)||decision.sourceSha256.length!==5||
    decision.sourceSha256.some(x=>!/^[a-f0-9]{64}$/.test(x)))fail('decision proof or identity changed');
  const id=`x-${day}-${windowEnd}-${row.symbol}`;
  const action=submitSevenSignal(state,{strategyId:STRATEGY,id,symbol:row.symbol,
   instrumentKey:row.instrument_key,side:row.side,signalAt:decision.barEndedAt,
   reason:decision.reason,realOrdersEnabled:false},now);
  state=action.state;statuses.push({symbol:row.symbol,status:action.status});
 }
 if(state.revision!==initial.revision)await saveSevenAccount(env.DB,initial,state,now);
 return {status:'PAPER_INTENTS_EVALUATED',queued:statuses.filter(x=>x.status==='PENDING').length,
  statuses,riskPolicyVersion:SEVEN_RISK_POLICY.version,realOrdersEnabled:false};
}

/** Parse the documented Upstox V3 top-of-book response with exact key identity. */
export function normalizeBookResponse(body,keys,receivedAt,sourceSha256){
 if(body?.status!=='success'||!body.data||typeof body.data!=='object'||
   Object.keys(body.data).length<1||Object.keys(body.data).length>keys.length||!Number.isSafeInteger(receivedAt)||
   !/^[a-f0-9]{64}$/.test(sourceSha256))fail('quote body incomplete');
 const out=new Map();
 for(const [name,value] of Object.entries(body.data))if(!name.startsWith('NSE_EQ:')||
   value?.symbol!==name.slice(7)||!keys.includes(value.instrument_token))fail('unrequested book identity');
 for(const key of keys){
  const pair=Object.entries(body.data).find(([name,value])=>name.startsWith('NSE_EQ:')&&value?.instrument_token===key);
  if(!pair)continue;
  if(pair[1]?.symbol!==pair[0].slice(7)||out.has(key))fail('book instrument identity');
  const value=pair[1],lastTrade=Number(value.last_trade_time),provider=Date.parse(value.timestamp);
  if(!Number.isSafeInteger(lastTrade)||!Number.isFinite(provider)||provider>receivedAt+1000||
    lastTrade>receivedAt+1000||receivedAt-provider>10000||
    !Number.isFinite(value.last_price)||value.last_price<=0)continue;
  const bid=value.depth?.buy?.[0],ask=value.depth?.sell?.[0];
  out.set(key,{source:'Upstox Analytics',instrumentKey:key,lastPrice:value.last_price,
   lastTradeAt:new Date(lastTrade).toISOString(),providerAt:new Date(provider).toISOString(),
   observedAt:new Date(receivedAt).toISOString(),
   bid:bid&&{price:bid.price,quantity:bid.quantity},
   ask:ask&&{price:ask.price,quantity:ask.quantity},sourceSha256});
 }
 return out;
}

export async function fetchPaperBooks(env,keys,fetcher=fetch,clock=()=>Date.now()){
 if(!keys.length)return new Map();
 if(keys.length>10||new Set(keys).size!==keys.length||keys.some(x=>!/^NSE_EQ\|INE[A-Z0-9]{9}$/.test(x))||
   typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100)
   fail('read-only book request invalid');
 // Source: https://upstox.com/developer/api-documentation/get-full-market-quote-v3/
 const url=new URL('https://api.upstox.com/v3/market-quote/quotes');
 url.searchParams.set('instrument_key',keys.join(','));
 const res=await fetcher(url.toString(),{method:'GET',redirect:'manual',signal:AbortSignal.timeout(7000),
  headers:{Authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN,Accept:'application/json'}});
 if(!res.ok||res.redirected||Number(res.headers.get('content-length'))>100000)fail('read-only book HTTP');
 const raw=await res.text();if(raw.length>100000)fail('read-only book size');
 const receivedAt=clock(),sha=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))));
 let body;try{body=JSON.parse(raw)}catch{fail('read-only book JSON')}
 return normalizeBookResponse(body,keys,receivedAt,sha);
}

/** One batched read per minute, one compare-and-swap account save; stale data cannot fill. */
export async function tickSevenForward(env,now=Date.now(),books=fetchPaperBooks){
 const minute=minuteOf(now);
 if(minute<555||minute>929)return {status:'OUTSIDE_MARKET'};
 const before=await loadSevenAccount(env.DB,STRATEGY);
 if(!before)fail('account missing');
 const active=[...new Set([...Object.keys(before.pending),...Object.keys(before.positions)])];
 if(!active.length)return {status:'IDLE',fills:0};
 const keys=active.map(symbol=>before.pending[symbol]?.instrumentKey||before.positions[symbol]?.instrumentKey);
 if(keys.some(x=>!x))fail('active instrument identity missing');
 let quotes,bookUnavailable=false;
 try{quotes=await books(env,keys)}catch{quotes=new Map();bookUnavailable=true;}
 const initial=before;
 let state=before,fills=0,exits=0,expired=0;
 for(const symbol of active){
  const key=before.pending[symbol]?.instrumentKey||before.positions[symbol]?.instrumentKey;
  const q=quotes.get(key);
  if(before.pending[symbol]){
   const result=settleSevenPending(state,symbol,q,now);
   state=result.state;if(result.status==='PAPER_FILLED')fills++;
   if(result.status==='EXPIRED')expired++;
  }
  // Never generate an exit from the same quote that opened a position.
  if(before.positions[symbol]&&!before.pending[symbol]){
   const signal=sevenRiskExit(state,symbol,q,now);
   if(signal){const result=submitSevenSignal(state,signal,now);state=result.state;
    if(result.status==='PENDING')exits++;}
  }
 }
 if(state.revision!==initial.revision)await saveSevenAccount(env.DB,initial,state,now);
 if(bookUnavailable)fail('read only book unavailable');
 return {status:'PAPER_EVALUATED',fills,exits,expired,openPositions:Object.keys(state.positions).length,
  pending:Object.keys(state.pending).length,realOrdersEnabled:false};
}
