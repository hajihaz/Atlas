import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnosePaperSource,unavailablePaperSource}
 from '../../scripts/paper_source_diagnostics.mjs';
import {sourceEligible} from '../../scripts/scheduled_paper_engine.mjs';
const PERIOD=7200000;
const start=Date.parse('2026-10-13T00:00:00Z');
const bars=Array.from({length:55},(_,i)=>({time:start+i*PERIOD,
 open:1000,high:1001,low:999,close:1000,volume:5}));
const lastClose=bars.at(-1).time+PERIOD;
const now=lastClose+17*60000;
const history={source:'CoinDCX public INR spot candles',
 symbol:'BTCINR',currency:'INR',realOrdersEnabled:false,
 paperExecutionEnabled:false,candles:[{time:bars[0].time}]};
const feed={currency:'INR',realOrdersEnabled:false};
const quote={symbol:'BTCINR',currency:'INR',price:9000000,
 sourceAt:new Date(now-1000).toISOString()};
const check=(change={})=>diagnosePaperSource({
 symbol:'BTCINR',history,feed,bars,quote,now,...change});
test('only an independently source-eligible observation returns PASS',()=>{
 const x=check();
 assert.equal(x.status,'PASS');
 assert.equal(x.code,'ELIGIBLE');
 assert.equal(x.liveOrdersEnabled,false);
 assert.equal(x.paperOrdersExecuted,false);
 assert.equal(x.latestBarClosedAt,new Date(lastClose).toISOString());
 assert.equal(sourceEligible(bars,quote,now,'BTCINR'),true);
});
test('late GitHub runner is labeled as candle stale, never as a trade',()=>{
 const time=lastClose+97*60000;
 const q={...quote,sourceAt:new Date(time-1000).toISOString()};
 const x=check({now:time,quote:q});
 assert.equal(x.code,'CLOSED_CANDLE_TOO_OLD');
 assert.equal(x.status,'BLOCKED');
 assert.equal(sourceEligible(bars,q,time,'BTCINR'),false);
 assert.equal(x.providerQuoteAt,null);
});
test('observed 77-minute provider delay is explicitly marked paper-only, 91 minutes still blocks',()=>{
 const time=lastClose+77*60000,q={...quote,sourceAt:new Date(time-1000).toISOString()};
 const x=check({now:time,quote:q});
 assert.equal(x.status,'PASS');
 assert.equal(x.code,'ELIGIBLE');
 assert.equal(x.latencyClass,'DELAYED_PAPER_ONLY');
 assert.equal(x.candleAgeMinutes,77);
 assert.equal(x.paperOrdersExecuted,false);
 assert.equal(x.liveOrdersEnabled,false);
 assert.equal(sourceEligible(bars,q,time,'BTCINR'),true);
 const tooLate=lastClose+91*60000;
 const reject=check({now:tooLate,quote:{...quote,sourceAt:new Date(tooLate-1000).toISOString()}});
 assert.equal(reject.code,'CLOSED_CANDLE_TOO_OLD');
 assert.equal(reject.status,'BLOCKED');
});
test('quotes with missing prices, future timestamps and staleness are blocked',()=>{
 for(const [delta,want] of [
  [{quote:{...quote,price:null}},'QUOTE_MISSING_OR_INVALID'],
  [{quote:{...quote,sourceAt:'broken'}},'QUOTE_TIMESTAMP_INVALID'],
  [{quote:{...quote,sourceAt:new Date(now+60000).toISOString()}},'QUOTE_FROM_FUTURE'],
  [{quote:{...quote,sourceAt:new Date(now-100000).toISOString()}},'QUOTE_TOO_OLD'],
  [{quote:{...quote,sourceAt:new Date(lastClose-60000).toISOString()}},'QUOTE_BEFORE_BAR_CLOSE'],
 ]){
  assert.equal(check(delta).code,want);
 }
});
test('history provider schema and consecutive candle contract are mandatory',()=>{
 assert.equal(check({history:{...history,source:'unknown'}}).code,'SOURCE_CONTRACT_INVALID');
 assert.equal(check({history:{...history,candles:[]},bars:bars.slice(0,30)}).code,
  'INSUFFICIENT_CLOSED_BARS');
 const corrupted=bars.map(b=>({...b}));
 corrupted[53].time-=PERIOD;
 assert.equal(check({bars:corrupted}).code,'GAP_IN_55_COMPLETED_BARS');
 assert.equal(check({symbol:'NSE:FAKE'}).code,'INVALID_REQUEST');
});
test('provider timeouts and simulation exceptions never masquerade as eligible',()=>{
 for(const kind of ['SOURCE_FETCH_FAILED','CANDLE_AGGREGATION_FAILED',
   'SIMULATION_VALIDATION_FAILED']){
  const state=unavailablePaperSource(now,kind);
  assert.equal(state.status,'BLOCKED');
  assert.equal(state.code,kind);
  assert.equal(state.paperOrdersExecuted,false);
  assert.equal(state.liveOrdersEnabled,false);
 }
 assert.throws(()=>unavailablePaperSource(now,'TRADE_EXECUTED'));
});
test('unsupported future and negative clock values fail closed',()=>{
 assert.equal(check({now:NaN}).status,'BLOCKED');
 assert.equal(check({now:-1}).code,'INVALID_REQUEST');
 assert.equal(check({now:lastClose-1}).code,'FUTURE_OR_INVALID_BAR');
});
