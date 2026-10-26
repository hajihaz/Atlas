import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDayTraderDemo} from '../src/lib/daytraderResearch.js';

const fixture=JSON.parse(readFileSync(new URL('../public/daytrader-nse-demo.json',import.meta.url),'utf8'));
const modified=changes=>structuredClone({...fixture,...changes});

test('offline published snapshot strictly labeled synthetic-only and exactly 20 sessions',()=>{
 const data=validateDayTraderDemo(fixture);
 assert.equal(data.sessions.length,20);
 assert.equal(data.monteCarlo.trials,10000);
 assert.equal(data.totalNet,Number(fixture.overview.total_net_pnl_inr_demo_only));
 assert.match(data.safetyLabel,/SYNTHETIC/);
 assert.equal(fixture.safety.production_enabled,false);
 assert.equal(fixture.safety.broker_orders_submitted,0);
});

test('UI explicitly labels demo, never offers order submission',()=>{
 const text=readFileSync(new URL('../src/components/DayTraderNSEPanel.tsx',import.meta.url),'utf8');
 const lab=readFileSync(new URL('../src/components/StrategyLabPage.tsx',import.meta.url),'utf8');
 assert.match(text,/SYNTHETIC FIXTURE/);
 assert.match(text,/No genuine NSE market observations were used/);
 assert.match(text,/validateDayTraderDemo/);
 assert.match(lab,/mode==='scalpstorm'&&<DayTraderNSEPanel\/>/);
 assert.doesNotMatch(text,/\bplaceOrder\b|\bsubmitOrder\b|\btradeLive\b/);
});

test('fail closed if market data or broker execution is claimed real',()=>{
 for(const safety of [
   {real_market_certified:true},
   {paper_trading_connected:true},
   {production_enabled:true},
   {live_NSE_data_used:true},
   {broker_orders_submitted:1},
 ]){
  const candidate=modified({safety:{...fixture.safety,...safety}});
  assert.throws(()=>validateDayTraderDemo(candidate));
 }
 for(const changes of [
  {report_type:'atlas_live_real_trades'},
  {dataset:{...fixture.dataset,kind:'nse_live'}},
  {bootstrap:{...fixture.bootstrap,real_market_certified:true}},
  {sessions:[]},
 ]){
  assert.throws(()=>validateDayTraderDemo(modified(changes)));
 }
});

test('reject forged extra sessions, invalid decimal, impossible quantiles',()=>{
 const bad=structuredClone(fixture);bad.sessions[0].net_pnl='NaN';
 assert.throws(()=>validateDayTraderDemo(bad));
 const qty=structuredClone(fixture);qty.sessions[0].shares=-2;
 assert.throws(()=>validateDayTraderDemo(qty));
 const forged=structuredClone(fixture);forged.sessions[0].reason='live_fill';
 assert.throws(()=>validateDayTraderDemo(forged));
 const range=structuredClone(fixture);range.bootstrap.p05_net_pnl_inr='99999.00';
 assert.throws(()=>validateDayTraderDemo(range));
 const total=structuredClone(fixture);total.overview.total_net_pnl_inr_demo_only='999999';
 assert.throws(()=>validateDayTraderDemo(total));
});

test('source hashes show decision separation and no real orders across every session',()=>{
 assert.equal(new Set(fixture.sessions.map(r=>r.session)).size,20);
 assert.ok(fixture.sessions.every(r=>r.orders_submitted===0&&r.data_class==='synthetic_fixture'));
 assert.ok(fixture.sessions.every(r=>/^[a-f0-9]{64}$/.test(r.decision_hash)));
 assert.ok(fixture.sessions.every(r=>/^[a-f0-9]{64}$/.test(r.source_hash)));
 assert.equal(fixture.bootstrap.orders_submitted,0);
});
