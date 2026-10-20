import test from 'node:test';
import assert from 'node:assert/strict';
import {createVirtualOrder,applyVirtualOrder}
 from '../../scripts/virtual_order_lifecycle.mjs';
const barClosedAt='2026-10-20T00:00:00.000Z';
const submittedAt='2026-10-20T00:00:10.000Z';
const at='2026-10-20T00:17:00.000Z';
const observedAt='2026-10-20T00:16:59.000Z';
const now=Date.parse(at);
const params={id:'scalp_btc_20261020_0000',strategyId:'sma_9_21',
 symbol:'BTCINR',side:'BUY',requestedQty:0.02,
 virtualCashLimitINR:101000,signalBarClosedAt:barClosedAt,submittedAt};
const make=(p={})=>createVirtualOrder({...params,...p});
const ev=(fillId,quantity=0.01,more={})=>({
 action:'FILL',at,sourceAt:observedAt,barClosedAt,
 modeledPriceINR:5000000,feeINR:quantity*5000000*0.001,
 quantity,fillId,...more,
});
test('virtual orders are never broker instructions or real-capital entries',()=>{
 const o=make();
 assert.equal(o.mode,'VIRTUAL_ORDER_INTENT_ONLY');
 assert.equal(o.status,'CREATED');
 assert.equal(o.realOrdersEnabled,false);
 assert.equal(o.actualCapitalINR,0);
 assert.equal(o.fills.length,0);
 assert.equal(o.filledQty,0);
 assert.equal(Object.isFrozen(o),true);
});
test('PENDING → PARTIALLY_FILLED → FILLED preserves budget, prices and fees',()=>{
 const o=make();const pending=applyVirtualOrder(o,{action:'SUBMIT',at:submittedAt},now);
 assert.equal(pending.status,'PENDING');
 assert.equal(pending.fills.length,0);
 const half=applyVirtualOrder(pending,ev('bar00_fill01'),now);
 assert.equal(half.status,'PARTIALLY_FILLED');
 assert.equal(half.filledQty,0.01);
 assert.equal(half.modeledNotionalINR,50000);
 assert.equal(half.modeledFeesINR,50);
 const done=applyVirtualOrder(half,ev('bar00_fill02'),now);
 assert.equal(done.status,'FILLED');
 assert.equal(done.filledQty,0.02);
 assert.equal(done.unfilledQty,0);
 assert.equal(done.modeledNotionalINR,100000);
 assert.equal(done.modeledFeesINR,100);
 assert.equal(done.fills.length,2);
 assert.equal(o.fills.length,0);
 assert.equal(pending.realOrdersEnabled,false);
});
test('duplicate fill ID is idempotent; changed amount or price is rejected',()=>{
 const o=applyVirtualOrder(make(),{action:'SUBMIT',at:submittedAt},now);
 const first=applyVirtualOrder(o,ev('bar00_fill01'),now);
 assert.strictEqual(applyVirtualOrder(first,ev('bar00_fill01'),now),first);
 assert.throws(()=>applyVirtualOrder(first,ev('bar00_fill01',0.005),now),/altered evidence/);
 assert.throws(()=>applyVirtualOrder(first,ev('bar00_fill01',0.01,{
   modeledPriceINR:5100000}),now),/altered evidence/);
});
test('rejected, cancelled and expired statuses block new modeled fills',()=>{
 const o=applyVirtualOrder(make(),{action:'SUBMIT',at:submittedAt},now);
 for(const action of ['CANCEL','REJECT','EXPIRE']){
  const done=applyVirtualOrder(o,{action,at},now);
  assert.equal(done.status,action==='CANCEL'?'CANCELLED':
    action==='REJECT'?'REJECTED':'EXPIRED');
  assert.throws(()=>applyVirtualOrder(done,ev('bar00_fill11'),now),/cannot receive modeled fills/);
  assert.throws(()=>applyVirtualOrder(done,{action:'SUBMIT',at},now),/terminal/);
 }
 const partial=applyVirtualOrder(o,ev('bar00_fill01'),now);
 const cancelled=applyVirtualOrder(partial,{action:'CANCEL',at},now);
 assert.equal(cancelled.filledQty,0.01);
 assert.throws(()=>applyVirtualOrder(partial,{action:'REJECT',at},now),/partially modeled/);
});
test('no virtual entry without a verifiable source observation',()=>{
 const o=applyVirtualOrder(make(),{action:'SUBMIT',at:submittedAt},now);
 const poisoned=[
  {sourceAt:'2026-10-20T00:14:00.000Z'},
  {barClosedAt:'2026-10-20T00:18:00.000Z'},
  {sourceAt:'2026-10-20T00:18:00.000Z'},
  {modeledPriceINR:0},
  {quantity:Infinity},
  {quantity:-1},
  {feeINR:-1},
  {at:'2026-10-20T00:16:00.000Z'},
 ];
 for(let i=0;i<poisoned.length;i++){
  const fake=ev('bar00_fake'+i,0.01,poisoned[i]);
  assert.throws(()=>applyVirtualOrder(o,fake,now));
 }
 assert.equal(o.fills.length,0);
});
test('exposure, ownership and overfill limits halt invalid modeled trades',()=>{
 const o=applyVirtualOrder(make(),{action:'SUBMIT',at:submittedAt},now);
 assert.throws(()=>applyVirtualOrder(o,ev('bar00_tooBig',0.03),now),/outstanding/);
 const lower=applyVirtualOrder(make({virtualCashLimitINR:200}),
   {action:'SUBMIT',at:submittedAt},now);
 assert.throws(()=>applyVirtualOrder(lower,ev('bar00_cash0'),now),/virtual cash/);
 assert.throws(()=>make({side:'SELL',virtualOwnedQty:0.001}),/Invalid virtual-only/);
 const short=make({side:'SELL',virtualCashLimitINR:0,virtualOwnedQty:0.02});
 const p=applyVirtualOrder(short,{action:'SUBMIT',at:submittedAt},now);
 assert.equal(applyVirtualOrder(p,ev('bar00_sell01'),now).status,'PARTIALLY_FILLED');
});
test('a replay cannot turn a cancelled order into a new fill or fake P/L',()=>{
 const o=applyVirtualOrder(make(),{action:'SUBMIT',at:submittedAt},now);
 const half=applyVirtualOrder(o,ev('bar00_fill01'),now);
 const cancelled=applyVirtualOrder(half,{action:'CANCEL',at},now);
 assert.strictEqual(applyVirtualOrder(cancelled,ev('bar00_fill01'),now),cancelled);
 assert.throws(()=>applyVirtualOrder(cancelled,ev('bar00_fill02'),now));
 assert.equal(cancelled.actualCapitalINR,0);
 assert.equal('realizedPnlINR' in cancelled,false);
});

test('77-minute closed candle with a fresh independent quote stays model-only',()=>{
 const delayed=Date.parse(barClosedAt)+77*60000;
 const observed=new Date(delayed-1000).toISOString();
 const order=createVirtualOrder({...params,submittedAt:observed});
 const pending=applyVirtualOrder(order,{action:'SUBMIT',at:observed},delayed);
 const filled=applyVirtualOrder(pending,{
  action:'FILL',fillId:'delayed:modeled:001',at:new Date(delayed).toISOString(),
  sourceAt:observed,barClosedAt,quantity:0.02,
  modeledPriceINR:5000000,feeINR:100
 },delayed);
 assert.equal(filled.status,'FILLED');
 assert.equal(filled.realOrdersEnabled,false);
 const later=delayed+14*60000;
 assert.throws(()=>applyVirtualOrder(pending,{
  action:'FILL',fillId:'too:old:modeled:01',at:new Date(later).toISOString(),
  sourceAt:new Date(later-1000).toISOString(),barClosedAt,
  quantity:0.02,modeledPriceINR:5000000,feeINR:100
 },later),/Unverified or invalid modeled fill evidence/);
});
