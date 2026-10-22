import test from 'node:test';
import assert from 'node:assert/strict';
import {composeTwoHourCandles,advanceCloud,failureState}
 from '../../scripts/scheduled_paper_engine.mjs';
import {attachPaperDecisionEvidence,countPaperDecisionEvidence}
 from '../../scripts/paper_decision_evidence.mjs';
import {assertNextCloudSnapshot} from '../../scripts/paper_ledger_guard.mjs';
import {decision} from '../lib/research-engine.js';
const H=3600000,T=2*H,base=Date.parse('2026-10-12T00:00:00Z');
const hourly=Array.from({length:154},(_,i)=>{
 const close=100000+i*350,open=close-100;
 return {time:base+i*H,open,close,high:close+200,low:open-200,volume:3};
});
const barsAt=n=>composeTwoHourCandles(hourly.slice(0,n),base+n*H+17*60000);
const nowAt=n=>base+n*H+17*60000;
const quoteAt=(n,bars)=>({symbol:'BTCINR',currency:'INR',
 price:bars.at(-1).close,sourceAt:new Date(nowAt(n)-1000).toISOString()});
const firstBars=barsAt(150),firstNow=nowAt(150),firstQuote=quoteAt(150,firstBars);
test('first source-validated seed labels five portfolios without backfilled orders',()=>{
 const init=advanceCloud(null,firstBars,firstQuote,firstNow);
 const explained=attachPaperDecisionEvidence(null,init,firstBars);
 assert.equal(explained.sessions.length,5);
 assert.equal(countPaperDecisionEvidence(explained).SEED_ONLY_NO_BACKFILL,5);
 assert.ok(explained.sessions.every(s=>s.lastDecisionEvidence.modeledFills===0));
 assert.deepEqual(init.sessions.map(s=>s.events),explained.sessions.map(s=>s.events));
 assert.equal(explained.actualCapitalINR,0);
});
test('same source bar never produces a second signal or modeled order',()=>{
 const seeded=attachPaperDecisionEvidence(null,advanceCloud(null,firstBars,firstQuote,firstNow),firstBars);
 const at=firstNow+15000,q={...firstQuote,sourceAt:new Date(at-1000).toISOString()};
 const noReplay=attachPaperDecisionEvidence(seeded,advanceCloud(seeded,firstBars,q,at),firstBars);
 assert.equal(countPaperDecisionEvidence(noReplay).SAME_BAR_REPLAY_BLOCKED,5);
 assert.ok(noReplay.sessions.every(s=>s.events.length===0));
 assert.equal(assertNextCloudSnapshot(seeded,noReplay,at),true);
});
test('next eligible candle reports SELL signal without holdings, not a virtual sale',()=>{
 const start=attachPaperDecisionEvidence(null,advanceCloud(null,firstBars,firstQuote,firstNow),firstBars);
 const bars=barsAt(152),q=quoteAt(152,bars),at=nowAt(152);
 assert.equal(decision('rsi_14',bars,bars.length-1),'SELL');
 const before=advanceCloud(start,bars,q,at);
 const result=attachPaperDecisionEvidence(start,before,bars);
 const rsi=result.sessions.find(s=>s.strategyId==='rsi_14');
 assert.equal(rsi.lastDecisionEvidence.code,'SELL_SIGNAL_WITHOUT_HOLDINGS');
 assert.equal(rsi.lastDecisionEvidence.signal,'SELL');
 assert.equal(rsi.lastDecisionEvidence.modeledFills,0);
 assert.equal(rsi.quantity,0);
 assert.equal(rsi.realizedPnlINR,0);
 assert.equal(assertNextCloudSnapshot(start,result,at),true);
});
test('missing interval is explained without evaluating retroactive buy/sell signal',()=>{
 const start=attachPaperDecisionEvidence(null,advanceCloud(null,firstBars,firstQuote,firstNow),firstBars);
 const bars=barsAt(154),q=quoteAt(154,bars),at=nowAt(154);
 const skipped=attachPaperDecisionEvidence(start,advanceCloud(start,bars,q,at),bars);
 assert.equal(skipped.status,'GAP_SKIPPED');
 assert.equal(countPaperDecisionEvidence(skipped).MISSED_BARS_NO_BACKFILL,5);
 assert.ok(skipped.sessions.every(s=>s.lastDecisionEvidence.signal==='NOT_EVALUATED'));
 assert.ok(skipped.sessions.every(s=>s.events.length===0));
 assert.equal(assertNextCloudSnapshot(start,skipped,at),true);
});
test('degraded source keeps last accepted decision immutable',()=>{
 const start=attachPaperDecisionEvidence(null,advanceCloud(null,firstBars,firstQuote,firstNow),firstBars);
 const degraded=failureState(start,'stale market provider',firstNow+T);
 assert.deepEqual(degraded.sessions,start.sessions);
 assert.throws(()=>attachPaperDecisionEvidence(start,degraded,firstBars),
  /source-unverified/);
});
test('forged modeled event during gap skip cannot be presented as a trade',()=>{
 const start=attachPaperDecisionEvidence(null,advanceCloud(null,firstBars,firstQuote,firstNow),firstBars);
 const bars=barsAt(154),q=quoteAt(154,bars),at=nowAt(154);
 const bad=advanceCloud(start,bars,q,at);
 bad.sessions[0].events.push({side:'BUY',quoteAt:q.sourceAt,barClosedAt:bad.lastBarClosedAt,
  modeledPriceINR:q.price,quantity:0.01,feeINR:5,realizedPnlINR:null,
  mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'});
 assert.throws(()=>attachPaperDecisionEvidence(start,bad,bars),
  /Model trade does not match/);
});
