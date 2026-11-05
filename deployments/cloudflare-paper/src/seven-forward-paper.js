/** Source-qualified ScalpStorm X virtual settlement. This module has no broker route. */
import {loadSevenAccount,saveSevenAccount} from './seven-paper-store.js';
import {submitSevenSignal,settleSevenPending,sevenRiskExit,SEVEN_RISK_POLICY} from './seven-paper-ledger.js';

import {FORWARD_PILOTS} from './seven-strategy-replay.js';
const STRATEGY='scalpstorm_x';
const digest=async s=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
const fail=reason=>{const e=Error('SEVEN_FORWARD_BLOCKED: '+reason);e.atlasDiagnostic='seven forward '+reason;throw e;};
const dayOf=ms=>new Date(ms+19800000).toISOString().slice(0,10);
const minuteOf=ms=>{const d=new Date(ms+19800000);return d.getUTCHours()*60+d.getUTCMinutes()};
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');

/** Attach only already-persisted, point-in-time X decisions to the independent account. */
export async function queueForwardX(env,day,windowEnd,now){return queueForwardStrategy(env,STRATEGY,day,windowEnd,now);}
export async function queueForwardStrategy(env,strategyId,day,windowEnd,now){
 if(!FORWARD_PILOTS.includes(strategyId))fail('strategy is unarmed');
 if(!env.DB||!env.HISTORY_DB||day!==dayOf(now)||!Number.isSafeInteger(windowEnd)||
   minuteOf(now)<581||minuteOf(now)>=SEVEN_RISK_POLICY.entryCutoffMinute)fail('decision slot or store');
 let rows=[];
 if(strategyId===STRATEGY){
  const run=await env.HISTORY_DB.prepare('SELECT status FROM live_x_runs WHERE source_date=? AND window_end_ms=?').bind(day,windowEnd).first();
  if(run?.status!=='EVALUATED')return {status:'SOURCE_NOT_QUALIFIED',queued:0};
  rows=(await env.HISTORY_DB.prepare("SELECT symbol,instrument_key,side,decision_json FROM live_x_decisions WHERE source_date=? AND window_end_ms=? AND status='SIGNAL' ORDER BY symbol").bind(day,windowEnd).all()).results;
 }else{
  const run=await env.HISTORY_DB.prepare('SELECT completed_ms,status,payload_json,payload_sha256 FROM forward_strategy_windows WHERE source_date=? AND strategy_id=? AND window_end_ms=?').bind(day,strategyId,windowEnd).first();
  if(run?.status!=='EVALUATED'||run.completed_ms>now)return {status:'SOURCE_NOT_QUALIFIED',queued:0};
  if(await digest(run.payload_json)!==run.payload_sha256)fail('VWAP persisted proof changed');
  const payload=JSON.parse(run.payload_json);if(!Array.isArray(payload.decisions)||payload.decisions.length!==10)fail('VWAP decision roster incomplete');
  rows=payload.decisions.filter(d=>d.status==='SIGNAL').map(d=>({symbol:d.symbol,instrument_key:d.instrumentKey,side:d.side,decision_json:JSON.stringify(d)}));
 }
 let state=await loadSevenAccount(env.DB,strategyId);
 if(!state)fail('account missing');
 const initial=state,statuses=[];
 for(const row of rows){
  let decision;try{decision=JSON.parse(row.decision_json)}catch{fail('decision JSON changed')}
  if(decision?.strategyId!==strategyId||decision?.sourceDate!==day||decision.symbol!==row.symbol||
    decision.status!=='SIGNAL'||decision.side!==row.side||
    !/^NSE_EQ\|IN[EF][A-Z0-9]{9}$/.test(row.instrument_key)||
    !Array.isArray(decision.sourceSha256)||decision.sourceSha256.length!==5||
    decision.sourceSha256.some(x=>!/^[a-f0-9]{64}$/.test(x)))fail('decision proof or identity changed');
  const id=`${strategyId==='scalpstorm_x'?'x':'vwap'}-${day}-${windowEnd}-${row.symbol}`;
  const action=submitSevenSignal(state,{strategyId,id,symbol:row.symbol,
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
 if(keys.length>10||new Set(keys).size!==keys.length||keys.some(x=>!/^NSE_EQ\|IN[EF][A-Z0-9]{9}$/.test(x))||
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
export async function tickSevenForward(env,now=Date.now(),books=fetchPaperBooks,clock=()=>Date.now(),options={}){
 const minute=minuteOf(now);
 if(minute<555||minute>929)return {status:'OUTSIDE_MARKET'};
 const strategyId=options.strategyId||STRATEGY;if(!FORWARD_PILOTS.includes(strategyId))fail('strategy is unarmed');
 const before=await loadSevenAccount(env.DB,strategyId);
 if(!before)fail('account missing');
 const active=[...new Set([...Object.keys(before.pending),...Object.keys(before.positions)])];
 if(!active.length)return {status:'IDLE',fills:0};
 const keys=active.map(symbol=>before.pending[symbol]?.instrumentKey||before.positions[symbol]?.instrumentKey);
 if(keys.some(x=>!x))fail('active instrument identity missing');
 let quotes,bookUnavailable=false;
 try{quotes=await books(env,keys)}catch{quotes=new Map();bookUnavailable=true;}
 // A source response arrives after the request began. Validate it at receipt/processing time.
 const processedAt=clock();
 if(!Number.isSafeInteger(processedAt)||processedAt<now||processedAt-now>20000)fail('processing clock outside bound');
 if(dayOf(processedAt)!==dayOf(now)||minuteOf(processedAt)>929)return {status:'OUTSIDE_MARKET'};
 const initial=before;
 let state=before,fills=0,exits=0,expired=0;
 for(const symbol of active){
  const key=before.pending[symbol]?.instrumentKey||before.positions[symbol]?.instrumentKey;
  const q=quotes.get(key);
  if(before.pending[symbol]){
   const result=settleSevenPending(state,symbol,q,processedAt);
   state=result.state;if(result.status==='PAPER_FILLED')fills++;
   if(result.status==='EXPIRED')expired++;
  }
  // Never generate an exit from the same quote that opened a position.
  if(before.positions[symbol]&&!state.pending[symbol]){
   const signal=sevenRiskExit(state,symbol,q,processedAt);
   if(signal){const result=submitSevenSignal(state,signal,processedAt);state=result.state;
    if(result.status==='PENDING')exits++;}
  }
 }
 if(state.revision!==initial.revision)await saveSevenAccount(env.DB,initial,state,processedAt);
 if(bookUnavailable)fail('read only book unavailable');
 if(exits>0&&options.followUp!==false){
  const next=await tickSevenForward(env,processedAt,books,clock,{...options,followUp:false});
  return {...next,fills:fills+(next.fills||0),exits:exits+(next.exits||0),expired:expired+(next.expired||0),bookPasses:2};
 }
 return {status:'PAPER_EVALUATED',fills,exits,expired,openPositions:Object.keys(state.positions).length,
  pending:Object.keys(state.pending).length,realOrdersEnabled:false};
}

/** Owner-only, read-only diagnosis of books needed by actual open paper positions. */
export async function readSevenBookStatus(env,books=fetchPaperBooks,clock=()=>Date.now()){
 const requestedAt=clock(),state=await loadSevenAccount(env.DB,STRATEGY);
 if(!state)fail('account missing');
 const active=Object.entries(state.positions);
 if(!active.length)return {schema:'atlas.paper-book-status.v1',status:'NO_OPEN_POSITIONS',positions:[],realOrdersEnabled:false};
 const quotes=await books(env,[...new Set(active.map(([,p])=>p.instrumentKey))]),now=clock();
 return {schema:'atlas.paper-book-status.v1',status:'OBSERVED',requestedAt:new Date(requestedAt).toISOString(),
  observedAt:new Date(now).toISOString(),elapsedMs:now-requestedAt,realOrdersEnabled:false,
  positions:active.map(([symbol,p])=>{const q=quotes.get(p.instrumentKey),book=p.direction==='SHORT'?q?.ask:q?.bid;
   return {symbol,quantity:p.qty,normalizedFreshBook:Boolean(q),providerAt:q?.providerAt??null,
    providerAgeMs:q?now-Date.parse(q.providerAt):null,bookQuantity:book?.quantity??null,
    sufficientExitDepth:Number.isSafeInteger(book?.quantity)&&Math.floor(book.quantity/4)>=p.qty,
    oldRequestClockWouldReject:q?Date.parse(q.observedAt)>requestedAt+1000:null,
    sourceSha256:q?.sourceSha256??null};})};
}

/** Bounded owner recovery trigger: existing prior-session positions only; never creates an entry. */
export async function requestCarryoverRecovery(env,now=Date.now(),books=fetchPaperBooks,clock=()=>Date.now()){
 const state=await loadSevenAccount(env.DB,STRATEGY);if(!state)fail('account missing');
 const held=Object.entries(state.positions),today=dayOf(now);
 if(!held.length)return {status:'NO_CARRYOVERS',realOrdersEnabled:false};
 if(held.some(([,p])=>!p.openedAt||dayOf(p.openedAt)>=today)||
  Object.keys(state.pending).some(symbol=>!state.positions[symbol]))fail('recovery only permits prior-session held positions');
 return tickSevenForward(env,now,books,clock);
}

/** Each armed account is independent; one failing account cannot suppress the other. */
export async function tickAllForward(env,now=Date.now(),books=fetchPaperBooks,clock=()=>Date.now()){
 const results=[];
 for(const strategyId of FORWARD_PILOTS){
  try{results.push({strategyId,...await tickSevenForward(env,now,books,clock,{strategyId})});}
  catch(e){results.push({strategyId,status:'ERROR',reason:e?.atlasDiagnostic||'FORWARD_ACCOUNT_UNAVAILABLE'});}
 }
 if(results.some(r=>r.status==='ERROR'))console.error('paper account settlement incomplete',JSON.stringify(results.filter(r=>r.status==='ERROR')));
 return {results,realOrdersEnabled:false};
}
