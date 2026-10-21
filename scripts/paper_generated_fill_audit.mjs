// Safety-only reconciliation between production virtual paper fill events and
// independently tested paper order/settlement modules. This NEVER creates a
// trade, broker instruction or market price. Throws on disagreement.
import {createVirtualOrder,applyVirtualOrder} from './virtual_order_lifecycle.mjs';
import {buildVirtualSettlementCandidate} from './virtual_order_accounting_bridge.mjs';
import {assertNextCloudSnapshot} from './paper_ledger_guard.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const nearly=(a,b,tolerance=0.03)=>finite(a)&&finite(b)&&Math.abs(a-b)<=tolerance;
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function incoming(previous,current){
 const old=previous.events,next=current.events;
 if(old.length===120){
  if(eq(old,next))return [];
  if(next.length!==120||!eq(old.slice(1),next.slice(0,119)))
   throw Error('Unsafe modeled fill rollover for reconciliation');
  return next.slice(119);
 }
 if(!eq(old,next.slice(0,old.length)))
  throw Error('Modeled fills were modified, not appended');
 return next.slice(old.length);
}
export function auditGeneratedPaperFills(before,after,quote,now){
 assertNextCloudSnapshot(before,after,now);
 if(!before?.sessions?.length||!after?.sessions?.length)return {audited:0,mode:'PAPER_AUDIT_ONLY'};
 if(!['RUNNING','DEGRADED','GAP_SKIPPED'].includes(before.status))
  throw Error('Unrecognized source state before modeled fill audit');
 let audited=0;
 for(const afterSession of after.sessions){
  const prior=before.sessions.find(s=>s.strategyId===afterSession.strategyId);
  if(!prior)throw Error('Virtual strategy identity disappeared');
  const events=incoming(prior,afterSession);
  if(events.length>1)throw Error('Multiple modeled fills for one research session');
  for(const e of events){
   if(!quote||quote.status!=='recent_provider_snapshot'
    ||e.quoteAt!==quote.sourceAt||after.status!=='RUNNING')
    throw Error('Invalid provider quote for modeled fill audit');
   // No broker ID is used. This deterministic simulated ID is trace-only.
   const fillId='paper:'+before.symbol+':'+prior.strategyId+':'+e.barClosedAt.replace(/[^0-9]/g,'')+':'+e.side;
   const order=createVirtualOrder({
    id:fillId,strategyId:prior.strategyId,symbol:before.symbol,
    side:e.side,requestedQty:e.quantity,
    virtualCashLimitINR:e.side==='BUY'?prior.cashINR:0,
    virtualOwnedQty:e.side==='SELL'?prior.quantity:0,
    signalBarClosedAt:e.barClosedAt,submittedAt:e.quoteAt
   });
   const submitted=applyVirtualOrder(order,{action:'SUBMIT',at:e.quoteAt},now);
   const filled=applyVirtualOrder(submitted,{
    action:'FILL',fillId,at:new Date(now).toISOString(),
    sourceAt:e.quoteAt,barClosedAt:e.barClosedAt,
    quantity:e.quantity,modeledPriceINR:e.modeledPriceINR,feeINR:e.feeINR
   },now);
   const settled=buildVirtualSettlementCandidate(before,filled,quote,now);
   const expected=settled.candidate.sessions.find(s=>s.strategyId===afterSession.strategyId);
   for(const field of ['cashINR','quantity','costINR','virtualEquityINR',
    'feesINR','realizedPnlINR']){
    if(!nearly(expected[field],afterSession[field],field==='quantity'?1e-8:0.03))
     throw Error('Modeled paper fill accounting mismatch: '+field);
   }
   if(expected.closedTrades!==afterSession.closedTrades||expected.wins!==afterSession.wins
      ||expected.status!==afterSession.status
      ||!nearly(expected.highestEquityINR,afterSession.highestEquityINR,0.03)
      ||!nearly(expected.maxDrawdownPct,afterSession.maxDrawdownPct,0.03)
      ||settled.realOrdersEnabled!==false||settled.actualCapitalINR!==0)
     throw Error('Modeled paper trading risk or trade-count mismatch');
   audited++;
  }
 }
 return {audited,mode:'PAPER_AUDIT_ONLY',realOrdersEnabled:false,actualCapitalINR:0};
}
