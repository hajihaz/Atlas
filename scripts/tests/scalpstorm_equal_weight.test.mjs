import test from 'node:test';
import assert from 'node:assert/strict';
import {planScalpStormEqualWeights} from '../prototypes/scalpstorm_equal_weight.mjs';
const symbols=['NSE:RELIANCE','NSE:TCS','NSE:INFY','NSE:HDFCBANK','NSE:ICICIBANK',
 'NSE:SBIN','NSE:BHARTIARTL','NSE:ITC','NSE:LT','NSE:AXISBANK'];

test('one lakh virtual capital plans ten 10k allocations without any trade',()=>{
 const x=planScalpStormEqualWeights(symbols);
 assert.equal(x.mode,'RESEARCH_ALLOCATION_PLAN_ONLY');
 assert.equal(x.capitalINR,100000);
 assert.equal(x.allocations.length,10);
 assert.deepEqual(x.allocations.map(v=>v.plannedCapitalINR),Array(10).fill(10000));
 assert.equal(x.allocations.reduce((n,v)=>n+v.plannedCapitalINR,0)+x.unallocatedINR,100000);
 assert.equal(x.realOrdersEnabled,false);
 assert.equal(x.paperOrdersExecuted,false);
 assert.equal(x.marketDataVerified,false);
 assert.ok(x.allocations.every(v=>v.tradesExecuted===0&&v.quantityPurchased===0));
});
test('missing or duplicate top ten inputs cannot silently create allocations',()=>{
 for(const list of [[],symbols.slice(0,9),[...symbols.slice(0,9),symbols[0]],
   [...symbols.slice(0,9),'BTCINR']]){
   assert.throws(()=>planScalpStormEqualWeights(list),RangeError);
 }
});
test('virtual balance is finite, bounded, and preserves integer paise',()=>{
 assert.throws(()=>planScalpStormEqualWeights(symbols,-1),RangeError);
 assert.throws(()=>planScalpStormEqualWeights(symbols,100000.1),RangeError);
 assert.throws(()=>planScalpStormEqualWeights(symbols,Infinity),RangeError);
 const x=planScalpStormEqualWeights(symbols,101);
 assert.equal(Math.round((x.allocations.reduce((n,v)=>n+v.plannedCapitalINR,0)
   +x.unallocatedINR)*100),10100);
});
test('allocation plan is not authorized execution input and is stable',()=>{
 const x=planScalpStormEqualWeights(symbols);
 assert.equal(Object.isFrozen(x),true);
 assert.equal(x.allocations[0].weight,0.1);
 assert.equal(x.allocations[0].symbol,'NSE:RELIANCE');
 assert.match(x.note,/no authorized NSE quotes/i);
});
