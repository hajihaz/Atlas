// Public virtual-paper ledger persistence boundary. No broker/order routes.
// A saved state must be strictly newer; a repeated completed candle may never
// cause another modeled fill. This is invariant checking, NOT authentication.
const asTime=x=>typeof x==='string'?Date.parse(x):NaN;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const exact=x=>JSON.stringify(x);
function assertLedger(state){
 if(!state||state.schema!==1||state.mode!=='SCHEDULED_VIRTUAL_PAPER'
  ||state.currency!=='INR'||state.symbol!=='BTCINR'
  ||state.realOrdersEnabled!==false||state.actualCapitalINR!==0
  ||!Number.isSafeInteger(state.runCount)||state.runCount<0
  ||!Array.isArray(state.sessions)||![0,5].includes(state.sessions.length))
  throw Error('Unsafe virtual research ledger');
 const ids=new Set();
 for(const s of state.sessions){
  if(!s||!['RUNNING','HALTED'].includes(s.status)||!s.strategyId
   ||ids.has(s.strategyId)||!Array.isArray(s.events)||s.events.length>120
   ||!finite(s.cashINR)||s.cashINR<0||!finite(s.quantity)||s.quantity<0
   ||!finite(s.virtualEquityINR)||s.virtualEquityINR<0
   ||!finite(s.feesINR)||s.feesINR<0||!finite(s.realizedPnlINR))
   throw Error('Unsafe individual virtual portfolio');
  ids.add(s.strategyId);
  const bars=new Set();
  for(const e of s.events){
   const quote=asTime(e?.quoteAt),bar=asTime(e?.barClosedAt);
   if(!['BUY','SELL'].includes(e?.side)||e.mode!=='HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'
    ||!Number.isFinite(quote)||!Number.isFinite(bar)||bar>quote
    ||bars.has(e.barClosedAt)||!finite(e.modeledPriceINR)||e.modeledPriceINR<=0
    ||!finite(e.quantity)||e.quantity<=0||!finite(e.feeINR)||e.feeINR<0
    ||(e.side==='SELL'&&!finite(e.realizedPnlINR))
    ||(e.side==='BUY'&&e.realizedPnlINR!==null))
    throw Error('Malformed or duplicate virtual fill');
   bars.add(e.barClosedAt);
  }
 }
}
export function assertNextCloudSnapshot(before,after,now){
 assertLedger(before);assertLedger(after);
 if(!finite(now)||now<=0||after.runCount!==before.runCount+1
  ||!Number.isFinite(asTime(after.lastRunAt))
  ||asTime(after.lastRunAt)>now+5000
  ||(before.lastRunAt&&asTime(after.lastRunAt)<asTime(before.lastRunAt))
  ||after.virtualCapitalPerStrategyINR!==100000)
  throw Error('Nonmonotonic or untrusted cloud checkpoint');
 const oldBar=before.lastBarClosedAt?asTime(before.lastBarClosedAt):null;
 const newBar=after.lastBarClosedAt?asTime(after.lastBarClosedAt):null;
 if(oldBar!==null&&(!Number.isFinite(newBar)||newBar<oldBar))
  throw Error('Cloud source candle clock regressed');
 if(!before.sessions.length){
  if(after.sessions.length===5 && after.sessions.some(s=>s.events.length!==0
   ||s.quantity!==0||s.cashINR!==100000||s.virtualEquityINR!==100000))
   throw Error('First checkpoint must not backfill fills');
  if(after.sessions.length===0&&after.status!=='AWAITING_VALID_SOURCE')
   throw Error('Unverified first run has misleading status');
  return true;
 }
 if(after.sessions.length!==5)throw Error('Existing portfolio history erased');
 if(!['RUNNING','DEGRADED','GAP_SKIPPED'].includes(after.status))
  throw Error('Unrecognized modeled-paper run status');
 const initial=new Map(before.sessions.map(s=>[s.strategyId,s]));
 for(const next of after.sessions){
  const old=initial.get(next.strategyId);
  if(!old)throw Error('Strategy portfolio identity changed');
  if(after.status==='DEGRADED'&&exact(next)!==exact(old))
    throw Error('Degraded source must preserve prior virtual portfolio exactly');
  if(next.events.length<old.events.length && old.events.length!==120)
   throw Error('Modeled transaction history was lost');
  // At most one modeled entry/exit per checkpoint, including at the
  // 120-event retention boundary. The old prefix/suffix must be unaltered.
  let fresh;
  if(old.events.length<120){
   if(exact(next.events.slice(0,old.events.length))!==exact(old.events))
    throw Error('Retained modeled transaction history changed');
   fresh=next.events.slice(old.events.length);
  }else if(exact(next.events)===exact(old.events)){
   fresh=[];
  }else{
   if(next.events.length!==120 ||
      exact(next.events.slice(0,119))!==exact(old.events.slice(1)))
    throw Error('Retained model history rolling window changed');
   fresh=next.events.slice(119);
  }
  if(fresh.length>1)throw Error('Too many modeled trades in one checkpoint');
  // A no-trade checkpoint can revalue equity with a verified quote and
  // apply a virtual risk halt, but cannot mint cash or realized returns.
  if(fresh.length===0){
   for(const field of ['cashINR','quantity','costINR','feesINR',
    'realizedPnlINR','closedTrades','wins','lastFillAt']){
    if(!Object.is(old[field],next[field]))
     throw Error('No modeled fill can change virtual holdings or P/L: '+field);
   }
  }
  if((oldBar===newBar||oldBar===null)&&fresh.length)
   throw Error('Duplicate modeled fill for repeated market bar');
  if(['DEGRADED','GAP_SKIPPED'].includes(after.status)&&fresh.length)
   throw Error('Fills forbidden during market outage/gap');
  if(fresh.length && newBar-oldBar!==7200000)
   throw Error('Nonconsecutive candle produced a modeled fill');
  if(fresh.length){
   const model=fresh[0],qTime=asTime(model.quoteAt);
   if(model.barClosedAt!==after.lastBarClosedAt
     ||!Number.isFinite(qTime)||qTime>asTime(after.lastRunAt)+5000
     ||(before.lastRunAt&&qTime<asTime(before.lastRunAt)))
    throw Error('Modeled fill not tied to the new source candle and run');
  }
 }
 return true;
}
