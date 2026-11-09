import test from 'node:test';
import assert from 'node:assert/strict';
import {MODELED_CAPITAL_INR,STRATEGIES,runAllStrategies,runSimulation,decision,validateResearchBars} from '../lib/research-engine.js';
import handler,{getLab} from '../api/strategy-lab.js';

const UNIT=3600000,start=Date.parse('2026-01-01T00:00:00Z');
const bars=Array.from({length:150},(_,i)=>{
 const close=10000+Math.sin(i/5)*200+i*4;
 const open=10000+Math.sin((i-1)/5)*200+i*4;
 return {time:start+i*UNIT,open,close,high:Math.max(open,close)+30,
  low:Math.min(open,close)-30,volume:12+i};
});
test('5 named strategies compute deterministic replay against actual-shaped source bars',()=>{
 const runs=runAllStrategies(bars,UNIT);
 assert.equal(runs.length,5);
 assert.equal(new Set(runs.map(x=>x.name)).size,5);
 assert.ok(runs.every(x=>Number.isFinite(x.endingEquityINR)));
 assert.ok(runs.every(x=>x.assumptions.nextBarOpenFill&&x.assumptions.fillGuarantee===false));
 assert.equal(MODELED_CAPITAL_INR,100000);
});
test('no trade can execute on or before its signal close, or prior to warm-up',()=>{
 for(const st of STRATEGIES){
  const run=runSimulation(st.id,bars,UNIT);
  for(const tr of run.trades){
   assert.equal(tr.barTime-tr.signalBarTime,UNIT);
   assert.ok(tr.barTime>=bars[28].time);
   assert.ok(tr.feeINR>=0);
  }
 }
});
test('a future candle cannot change earlier simulated decisions or fills',()=>{
 for(const st of STRATEGIES){
  const first=runSimulation(st.id,bars.slice(0,100),UNIT);
  const future=bars.slice(100).map(c=>({...c,close:c.close*5,high:c.high*10}));
  const second=runSimulation(st.id,[...bars.slice(0,100),...future],UNIT);
  assert.deepEqual(second.trades.filter(x=>x.barTime<bars[100].time),first.trades);
 }
});
test('duplicate, nonfinite, impossible OHLC and out-of-order data fail closed',()=>{
 assert.throws(()=>validateResearchBars([bars[1],bars[1]],UNIT));
 assert.throws(()=>validateResearchBars([{...bars[0],close:NaN}],UNIT));
 assert.throws(()=>validateResearchBars([{...bars[0],low:bars[0].high+10}],UNIT));
 assert.throws(()=>validateResearchBars([bars[2],bars[1]],UNIT));
 assert.equal(decision('sma_9_21',bars,12),'HOLD');
 assert.throws(()=>decision('invented_strategy',bars,30));
});
test('simulation does not silently force a final liquidation or claim broker result',()=>{
 const run=runSimulation('sma_9_21',bars,UNIT);
 assert.equal(typeof run.openPosition,'boolean');
 assert.equal(run.assumptions.spreadModeled,false);
 assert.ok(run.equity.every(x=>Number.isFinite(x.equityINR)));
 assert.ok(run.wins<=run.closedTrades);
});
test('catalog lists ScalpStorm X as flagship plus the five approved strategies without calling replay providers',async()=>{
 let called=false;const result=await getLab({},async()=>{called=true;throw Error();});
 assert.equal(called,false);
 assert.deepEqual(result.strategies.map(s=>s.id),['scalpstorm_x_0940','sma_9_21','ema_12_26','rsi_14','breakout_20','sps_pullback']);
 const rule=result.strategies[0];assert.equal(rule.flagship,true);
 assert.equal(rule.entryIST,'09:40');assert.equal(rule.exitIST,'15:15');
 assert.ok(result.strategies.every(s=>s.results===null));
 assert.equal(result.realOrdersEnabled,false);assert.equal(result.paperOnly,true);
});
test('unsupported queries and all mutation methods are refused',async()=>{
 await assert.rejects(getLab({symbol:'HACK'}),/unsupported/);
 await assert.rejects(getLab({strategy:'sma_9_21'}),/unsupported/);
 const response={status(n){this.code=n;return this},setHeader(k,v){this[k]=v},json(x){return x}};
 const r=await handler({method:'POST',query:{},body:{side:'BUY'}},response);
 assert.equal(response.code,405);assert.equal(response.Allow,'GET');assert.equal(r.error,'method_not_allowed');
 const r2=await handler({method:'GET',query:{symbol:'HACK'}},response);
 assert.equal(response.code,400);assert.equal(r2.error,'unsupported_market_or_period');
});
