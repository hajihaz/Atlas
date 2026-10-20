import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState} from '../../scripts/scheduled_paper_engine.mjs';
import {createVirtualOrder,applyVirtualOrder} from '../../scripts/virtual_order_lifecycle.mjs';
import {buildVirtualSettlementCandidate} from '../../scripts/virtual_order_accounting_bridge.mjs';
import {assertNextCloudSnapshot} from '../../scripts/paper_ledger_guard.mjs';
const T=7200000;
const base=Date.parse('2026-10-20T00:00:00Z');
const oldNow=base+17*60000;
const at=bar=>bar+17*60000;
const str=d=>new Date(d).toISOString();
const seed=()=>freshState('BTCINR',base,oldNow,{sourceAt:str(oldNow-1000)});
function modeledOrder({before=seed(),side='BUY',now=at(base+T),
 price=4000000,quantity=0.02,fee=80,fillId='fill:model:1234'}={}){
 const newBar=Date.parse(before.lastBarClosedAt)+T;
 const close=str(newBar),submittedAt=str(newBar+1000),sourceAt=str(now-1000);
 const previous=before.sessions[0];
 const order=createVirtualOrder({id:'virtual:model:20261020:'+side,
  strategyId:previous.strategyId,symbol:'BTCINR',side,requestedQty:quantity,
  virtualCashLimitINR:side==='BUY'?previous.cashINR:0,
  virtualOwnedQty:side==='SELL'?previous.quantity:0,
  signalBarClosedAt:close,submittedAt});
 const pending=applyVirtualOrder(order,{action:'SUBMIT',at:submittedAt},now);
 const filled=applyVirtualOrder(pending,{action:'FILL',fillId,
  at:str(now),sourceAt,barClosedAt:close,
  modeledPriceINR:price,quantity,feeINR:fee},now);
 const quote={symbol:'BTCINR',currency:'INR',status:'recent_provider_snapshot',
   sourceAt,price};
 return {filled,quote,now};
}
test('paper-only BUY settles cash, units and costs once; source reports remain unchanged',()=>{
 const before=seed();
 const {filled,quote,now}=modeledOrder();
 const oldJson=JSON.stringify(before);
 const {candidate,modeledOrderEvent,realOrdersEnabled,actualCapitalINR}=buildVirtualSettlementCandidate(before,filled,quote,now);
 const changed=candidate.sessions[0];
 assert.equal(changed.cashINR,19920);
 assert.equal(changed.quantity,0.02);
 assert.equal(changed.costINR,80080);
 assert.equal(changed.feesINR,80);
 assert.equal(changed.virtualEquityINR,99920);
 assert.equal(changed.realizedPnlINR,0);
 assert.equal(changed.events.length,1);
 assert.equal(modeledOrderEvent.realizedPnlINR,null);
 assert.equal(candidate.sessions.slice(1).reduce((n,s)=>n+s.events.length,0),0);
 assert.equal(realOrdersEnabled,false);
 assert.equal(actualCapitalINR,0);
 assert.equal(JSON.stringify(before),oldJson);
 assert.equal(assertNextCloudSnapshot(before,candidate,now),true);
});
test('later full modeled sale settles realized profit without double-counting buy fee',()=>{
 const before=seed();
 const buy=modeledOrder();
 const b=buildVirtualSettlementCandidate(before,buy.filled,buy.quote,buy.now).candidate;
 const sellAt=buy.now+T;
 const sale=modeledOrder({before:b,side:'SELL',now:sellAt,price:4100000,
  quantity:0.02,fee:82,fillId:'fill:model:sell345'});
 const {candidate,modeledOrderEvent}=buildVirtualSettlementCandidate(b,sale.filled,sale.quote,sellAt);
 const changed=candidate.sessions[0];
 assert.equal(changed.cashINR,101838);
 assert.equal(changed.quantity,0);
 assert.equal(changed.virtualEquityINR,101838);
 assert.equal(changed.realizedPnlINR,1838);
 assert.equal(changed.wins,1);
 assert.equal(changed.closedTrades,1);
 assert.equal(changed.feesINR,162);
 assert.equal(modeledOrderEvent.realizedPnlINR,1838);
 assert.equal(changed.events.length,2);
 assert.equal(changed.events[0].side,'BUY');
 assert.equal(changed.events[1].side,'SELL');
 assert.equal(assertNextCloudSnapshot(b,candidate,sellAt),true);
});
test('source timestamps, repeated candles and cash shortage reject synthetic settlement',()=>{
 const before=seed();const {filled,quote,now}=modeledOrder();
 const poison=[
  [filled,{...quote,status:'unverified'},now],
  [filled,{...quote,price:3900000},now],
  [filled,{...quote,sourceAt:str(now-5000)},now],
  [filled,quote,now+110000],
  [filled,quote,now+T],
 ];
 for(const [o,q,t] of poison)
  assert.throws(()=>buildVirtualSettlementCandidate(before,o,q,t),/Virtual settlement blocked/);
 const candidate=buildVirtualSettlementCandidate(before,filled,quote,now).candidate;
 assert.throws(()=>buildVirtualSettlementCandidate(candidate,filled,quote,now),
  /Virtual settlement blocked/);
 const fake=structuredClone(filled);fake.fills[0].feeINR=900;
 assert.throws(()=>buildVirtualSettlementCandidate(before,fake,quote,now));
 const poverty=structuredClone(before);poverty.sessions[0].cashINR=100;
 assert.throws(()=>buildVirtualSettlementCandidate(poverty,filled,quote,now),/exceeds available cash/);
});
test('partial, cancelled and rejected orders are never silently treated as completed fills',()=>{
 const before=seed(),{filled,quote,now}=modeledOrder();
 for(const status of ['PARTIALLY_FILLED','CANCELLED','REJECTED','PENDING']){
  assert.throws(()=>buildVirtualSettlementCandidate(before,{...filled,status},quote,now),
   /fully source-verified hypothetical fill/);
 }
 const multi=structuredClone(filled);multi.fills.push(multi.fills[0]);
 assert.throws(()=>buildVirtualSettlementCandidate(before,multi,quote,now));
});
test('no same-bar modeled entry can be inserted as replay on a restarted ledger',()=>{
 const before=seed(),{filled,quote,now}=modeledOrder();
 const next=buildVirtualSettlementCandidate(before,filled,quote,now).candidate;
 const mutated=structuredClone(next);
 mutated.runCount++;mutated.lastRunAt=str(now+1000);
 const another=modeledOrder({before:mutated,now:now+T,price:4200000,
  fee:84,fillId:'fill:model:restart345'});
 // A second entry is blocked while the same virtual holding remains open.
 assert.throws(()=>buildVirtualSettlementCandidate(mutated,another.filled,another.quote,now+T),
   /existing position/);
 assert.equal(next.actualCapitalINR,0);
});
