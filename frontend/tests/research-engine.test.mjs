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
test('provider-backed strategy endpoint returns all strategy names and source provenance',async()=>{
 const fake=async ({symbol,range})=>({
  schema:1,currency:'INR',symbol,range,realOrdersEnabled:false,
  paperExecutionEnabled:false,source:'CoinDCX public INR spot candles',
  generatedAt:'2026-10-19T12:00:00Z',earliestAvailable:'2026-10-01T00:00:00Z',
  latestClosedAt:'2026-10-19T11:00:00Z',coverage:'provider_observations',
  completeHistoryVerified:false,warning:'source only',candles:bars,
 });
 const result=await getLab({symbol:'BTCINR',range:'1M'},fake);
 assert.equal(result.strategies.length,5);
 assert.equal(result.simulatedCapitalINR,100000);
 assert.equal(result.currency,'INR');
 assert.equal(result.paperOrdersExecuted,false);
 assert.equal(result.paperLedgerStored,false);
 assert.equal(result.liveOrdersEnabled,false);
});
test('unavailable historical provider does not fabricate returns',async()=>{
 const fake=async ({symbol,range})=>({
  schema:1,currency:'INR',symbol,range,realOrdersEnabled:false,
  paperExecutionEnabled:false,source:'CoinDCX public INR spot candles',
  generatedAt:'2026-10-19T12:00:00Z',earliestAvailable:null,latestClosedAt:null,
  coverage:'unavailable',completeHistoryVerified:false,warning:'no bars',candles:[],
 });
 const r=await getLab({},fake);
 assert.equal(r.barCount,0);
 assert.ok(r.strategies.every(x=>x.status==='insufficient_history'));
 assert.ok(r.strategies.every(x=>x.modeledReturnPct===undefined));
});
test('reject untrusted input and any execution/mutation HTTP methods',async()=>{
 assert.throws(()=>getLab({symbol:'NSE:RELIANCE'}),/unsupported/);
 const response={status(n){this.code=n;return this},setHeader(k,v){this[k]=v},json(x){return x}};
 const r=await handler({method:'POST',query:{symbol:'BTCINR'},body:{side:'BUY'}},response);
 assert.equal(response.code,405);assert.equal(response.Allow,'GET');
 assert.equal(r.error,'method_not_allowed');
 const r2=await handler({method:'GET',query:{symbol:'HACK'}},response);
 assert.equal(response.code,400);assert.equal(r2.error,'unsupported_market_or_period');
});
