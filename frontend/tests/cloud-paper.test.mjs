import test from 'node:test';
import assert from 'node:assert/strict';
import {composeTwoHourCandles,sourceEligible,freshState,advanceCloud,
 failureState,recordUnverifiedFirstCheckpoint,CHECKPOINT_MS} from '../../scripts/scheduled_paper_engine.mjs';
const H=3600000,T=2*H;
const base=Date.parse('2026-10-12T00:00:00Z');
const hourly=Array.from({length:150},(_,i)=>{
 const close=85000+i*19+Math.sin(i/7)*400,open=close-10;
 return {time:base+i*H,open,close,high:close+18,low:open-18,volume:2};
});
const aggregated=composeTwoHourCandles(hourly,base+150*H+17*60000);
const now=base+150*H+17*60000;
const quote={symbol:'BTCINR',currency:'INR',price:aggregated.at(-1).close+5,
 sourceAt:new Date(now-5000).toISOString()};
test('2-hour aggregation only uses two complete hourly candles',()=>{
 assert.equal(aggregated.length,75);
 assert.equal(aggregated.at(-1).time+T,base+150*H);
 assert.equal(aggregated[0].open,hourly[0].open);
 assert.equal(aggregated[0].close,hourly[1].close);
 assert.equal(CHECKPOINT_MS,T);
});
test('first run seeds five portfolios but never fabricates prior positions',()=>{
 assert.ok(sourceEligible(aggregated,quote,now,'BTCINR'));
 const s=advanceCloud(null,aggregated,quote,now);
 assert.equal(s.sessions.length,5);
 assert.ok(s.sessions.every(x=>x.events.length===0&&x.quantity===0&&x.cashINR===100000));
 assert.equal(s.actualCapitalINR,0);
 assert.equal(s.realOrdersEnabled,false);
 assert.equal(s.firstRunHasNoBackfilledTrades,true);
});
test('repeated same candle makes no virtual order, future source changes do not backfill',()=>{
 const start=advanceCloud(null,aggregated,quote,now);
 const same=advanceCloud(start,aggregated,quote,now+4000);
 assert.ok(same.sessions.every(x=>x.events.length===0));
 assert.equal(same.lastBarClosedAt,start.lastBarClosedAt);
 const nextHourly=[...hourly,...Array.from({length:2},(_,i)=>{
  const close=87000+i*10;
  return {time:base+(150+i)*H,open:close-5,close,high:close+8,low:close-10,volume:2};
 })];
 const later=now+T;
 const bars=composeTwoHourCandles(nextHourly,later);
 const q={...quote,sourceAt:new Date(later-1000).toISOString()};
 const updated=advanceCloud(start,bars,q,later);
 assert.equal(updated.lastBarClosedAt,new Date(base+152*H).toISOString());
 assert.equal(updated.skippedIntervals,0);
 assert.equal(updated.runCount,2);
 assert.ok(updated.sessions.every(x=>x.virtualEquityINR>=0));
});
test('missed scheduled intervals never get retroactively filled',()=>{
 const start=advanceCloud(null,aggregated,quote,now);
 const extended=[...hourly,...Array.from({length:4},(_,i)=>{
  const close=87000+i*10;return {time:base+(150+i)*H,open:close-3,close,high:close+5,low:close-5,volume:2};
 })];
 const later=now+2*T;
 const bars=composeTwoHourCandles(extended,later);
 const updated=advanceCloud(start,bars,{...quote,sourceAt:new Date(later-300).toISOString()},later);
 assert.equal(updated.status,'GAP_SKIPPED');
 assert.equal(updated.skippedIntervals,1);
 assert.ok(updated.sessions.every(x=>x.events.length===0));
});
test('missing pairs, poisoned prices, stale timestamps cannot mutate virtual state',()=>{
 assert.equal(sourceEligible(aggregated,{...quote,price:Infinity},now,'BTCINR'),false);
 assert.equal(sourceEligible(aggregated,{...quote,symbol:'NSE:RELIANCE'},now,'NSE:RELIANCE'),false);
 assert.equal(sourceEligible(aggregated,{...quote,sourceAt:new Date(now-150000).toISOString()},now,'BTCINR'),false);
 assert.throws(()=>advanceCloud(null,aggregated,{...quote,price:0},now));
});
test('source outage reports degradation without faking fills',()=>{
 const old=advanceCloud(null,aggregated,quote,now);
 const next=failureState(old,'provider unavailable',now+T);
 assert.equal(next.status,'DEGRADED');
 assert.equal(next.sessions.length,5);
 assert.ok(next.sessions.every(s=>s.events.length===0));
 assert.equal(next.realOrdersEnabled,false);
});

test('first failed cloud checkpoint records attempt but never invents market data or trades',()=>{
 const seed={schema:1,mode:'SCHEDULED_VIRTUAL_PAPER',currency:'INR',
  symbol:'BTCINR',interval:'2h',status:'AWAITING_FIRST_RUN',
  actualCapitalINR:0,realOrdersEnabled:false,runCount:0,lastRunAt:null,
  lastProviderAt:null,lastBarClosedAt:null,sessions:[],alert:null};
 const failure=recordUnverifiedFirstCheckpoint(seed,now,'provider down');
 assert.equal(failure.status,'AWAITING_VALID_SOURCE');
 assert.equal(failure.runCount,1);
 assert.deepEqual(failure.sessions,[]);
 assert.equal(failure.actualCapitalINR,0);
 assert.equal(failure.lastProviderAt,null);
 assert.equal(failure.lastBarClosedAt,null);
 assert.equal(failure.realOrdersEnabled,false);
 const retry=recordUnverifiedFirstCheckpoint(failure,now+T,'still down');
 assert.equal(retry.runCount,2);
 const seeded=advanceCloud(null,aggregated,quote,now);
 assert.equal(seeded.sessions.length,5);
 assert.ok(seeded.sessions.every(s=>s.events.length===0&&s.quantity===0));
 assert.throws(()=>recordUnverifiedFirstCheckpoint(failure,now-10,'clock regression'));
 assert.throws(()=>recordUnverifiedFirstCheckpoint({...failure,realOrdersEnabled:true},now+T,'unsafe'));
});
