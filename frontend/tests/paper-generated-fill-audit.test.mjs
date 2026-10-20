import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,failureState} from '../../scripts/scheduled_paper_engine.mjs';
import {createVirtualOrder,applyVirtualOrder} from '../../scripts/virtual_order_lifecycle.mjs';
import {buildVirtualSettlementCandidate} from '../../scripts/virtual_order_accounting_bridge.mjs';
import {auditGeneratedPaperFills} from '../../scripts/paper_generated_fill_audit.mjs';
const T=7200000,base=Date.parse('2026-10-20T00:00:00Z'),qms=base+17*60000;
const stamp=n=>new Date(n).toISOString();
const init=()=>freshState('BTCINR',base,qms,{sourceAt:stamp(qms-1000)});
function fulfill(before,side='BUY',price=4000000,qty=0.02,fee=80){
 const close=Date.parse(before.lastBarClosedAt)+T;
 const now=close+17*60000;
 const sourceAt=stamp(now-1000),barClosedAt=stamp(close);
 const prior=before.sessions[0];
 const quote={symbol:'BTCINR',currency:'INR',price,sourceAt,status:'recent_provider_snapshot'};
 const order=createVirtualOrder({id:'paper:research:12345:'+side,
  strategyId:prior.strategyId,symbol:'BTCINR',side,requestedQty:qty,
  virtualCashLimitINR:side==='BUY'?prior.cashINR:0,
  virtualOwnedQty:side==='SELL'?prior.quantity:0,
  signalBarClosedAt:barClosedAt,submittedAt:sourceAt});
 const pending=applyVirtualOrder(order,{action:'SUBMIT',at:sourceAt},now);
 const filled=applyVirtualOrder(pending,{action:'FILL',
  fillId:'source:modeled:12345:'+side,at:stamp(now),sourceAt,barClosedAt,
  modeledPriceINR:price,quantity:qty,feeINR:fee},now);
 const after=buildVirtualSettlementCandidate(before,filled,quote,now).candidate;
 return {after,quote,now};
}
test('the independent audit verifies one modeled BUY without creating a second fill',()=>{
 const before=init(),{after,quote,now}=fulfill(before);
 const pristine=JSON.stringify(after);
 const result=auditGeneratedPaperFills(before,after,quote,now);
 assert.deepEqual(result,{audited:1,mode:'PAPER_AUDIT_ONLY',
  realOrdersEnabled:false,actualCapitalINR:0});
 assert.equal(JSON.stringify(after),pristine);
 assert.equal(after.sessions[0].events.length,1);
 assert.equal(after.sessions[0].virtualEquityINR,99920);
});
test('the independent audit verifies model SELL realized gain and exact fees',()=>{
 const before=init(),b=fulfill(before),s=fulfill(b.after,'SELL',4100000,0.02,82);
 assert.equal(auditGeneratedPaperFills(b.after,s.after,s.quote,s.now).audited,1);
 assert.equal(s.after.sessions[0].realizedPnlINR,1838);
 assert.equal(s.after.sessions[0].closedTrades,1);
 assert.equal(s.after.sessions[0].feesINR,162);
 assert.equal(s.after.realOrdersEnabled,false);
});
test('a provider outage cannot append an invented modeled trade',()=>{
 const before=init(),now=qms+3000,after=failureState(before,'timeout',now);
 const v=auditGeneratedPaperFills(before,after,null,now);
 assert.equal(v.audited,0);
 assert.equal(after.status,'DEGRADED');
});
test('paper balances, fees and order state divergence fail closed',()=>{
 const before=init(),{after,quote,now}=fulfill(before);
 const distortions=[
  n=>{n.sessions[0].cashINR+=1;},
  n=>{n.sessions[0].virtualEquityINR+=1;},
  n=>{n.sessions[0].feesINR+=1;},
  n=>{n.sessions[0].realizedPnlINR=100;},
  n=>{n.sessions[0].closedTrades=3;},
  n=>{n.sessions[0].events[0].feeINR+=1;},
  n=>{n.sessions[0].events[0].modeledPriceINR*=1.1;},
  n=>{n.status='GAP_SKIPPED';},
 ];
 for(const alter of distortions){
  const poisoned=structuredClone(after);
  alter(poisoned);
  assert.throws(()=>auditGeneratedPaperFills(before,poisoned,quote,now));
 }
});
test('same-bar replays and incorrect source quote are rejected',()=>{
 const before=init(),{after,quote,now}=fulfill(before);
 assert.throws(()=>auditGeneratedPaperFills(before,after,{...quote,
  sourceAt:stamp(now-10000)},now),/Invalid provider quote/);
 const bad=structuredClone(after);
 bad.lastBarClosedAt=before.lastBarClosedAt;
 assert.throws(()=>auditGeneratedPaperFills(before,bad,quote,now),/Duplicate modeled fill/);
});
