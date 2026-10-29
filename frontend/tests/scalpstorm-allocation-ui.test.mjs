import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planScalpStormEqualWeights} from '../../scripts/prototypes/scalpstorm_equal_weight.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const panel=read('../src/components/ScalpStormAllocationPlan.tsx');
const lab=read('../src/components/StrategyLabPage.tsx');
const styles=read('../src/strategy.css');
test('ScalpStorm dashboard exposes ten equal planned slots, virtual-only',()=>{
 assert.match(panel,/VIRTUAL_CAPITAL_INR=100000/);
 assert.match(panel,/STOCK_SLOTS=10/);
 assert.match(panel,/SLOTS\.map/);
 assert.match(panel,/No NSE profits have been calculated/);
 assert.match(panel,/Symbol unverified/);
 assert.match(panel,/not invested capital/);
 assert.match(panel,/18 September/);
 assert.match(panel,/16 October 2026/);
 assert.match(lab,/<ScalpStormDetailed\/>/);
 assert.match(lab,/<ScalpStormAllocationPlan\/>/);
 assert.match(styles,/@media\(max-width:640px\)/);
});
test('capital split is exactly ₹10k each, with zero fictitious orders',()=>{
 const topTen=['NSE:RELIANCE','NSE:TCS','NSE:INFY','NSE:HDFCBANK','NSE:ICICIBANK',
 'NSE:SBIN','NSE:BHARTIARTL','NSE:ITC','NSE:LT','NSE:AXISBANK'];
 const data=planScalpStormEqualWeights(topTen);
 assert.equal(data.allocations.length,10);
 assert.ok(data.allocations.every(v=>v.plannedCapitalINR===10000
    &&v.quantityPurchased===0&&v.tradesExecuted===0));
 assert.equal(data.realOrdersEnabled,false);
 assert.equal(data.marketDataVerified,false);
});
