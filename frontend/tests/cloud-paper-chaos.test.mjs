import test from 'node:test';
import assert from 'node:assert/strict';
import {composeTwoHourCandles,advanceCloud,failureState}
 from '../../scripts/scheduled_paper_engine.mjs';
import {assertNextCloudSnapshot} from '../../scripts/paper_ledger_guard.mjs';
const H=3600000,T=2*H,base=Date.parse('2026-10-12T00:00:00Z');
function candle(i){
 const close=9000000+i*600+Math.sin(i/8)*35000,open=close-250;
 return {time:base+i*H,open,close,high:Math.max(open,close)+400,
   low:Math.min(open,close)-400,volume:1.5};
}
const source=Array.from({length:150},(_,i)=>candle(i));
function sample(n,now){return composeTwoHourCandles(Array.from({length:n},(_,i)=>candle(i)),now)}
const firstNow=base+150*H+17*60000;
const quote=(now,bars)=>({symbol:'BTCINR',currency:'INR',
 price:bars.at(-1).close,sourceAt:new Date(now-1000).toISOString()});
test('restart and same-bar retry preserve modeled positions and prohibit fills',()=>{
 const bars=sample(150,firstNow),q=quote(firstNow,bars);
 const start=advanceCloud(null,bars,q,firstNow);
 const restarted=JSON.parse(JSON.stringify(start));
 const same=advanceCloud(restarted,bars,quote(firstNow+9000,bars),firstNow+9000);
 assertNextCloudSnapshot(restarted,same,firstNow+9000);
 assert.ok(same.sessions.every(s=>s.events.length===0&&s.quantity===0));
});
test('failed provider fetch and later source recovery do not invent gap fills',()=>{
 const bars=sample(150,firstNow),start=advanceCloud(null,bars,quote(firstNow,bars),firstNow);
 const lost=failureState(start,'provider timeout',firstNow+25000);
 assertNextCloudSnapshot(start,lost,firstNow+25000);
 const resumeAt=firstNow+T;
 const nextBars=sample(152,resumeAt);
 const resumed=advanceCloud(JSON.parse(JSON.stringify(lost)),
   nextBars,quote(resumeAt,nextBars),resumeAt);
 assertNextCloudSnapshot(lost,resumed,resumeAt);
 assert.equal(resumed.runCount,3);
 assert.equal(resumed.skippedIntervals,0);
});
test('kill/restart after multiple missed candles cannot backfill late entries',()=>{
 const bars=sample(150,firstNow),start=advanceCloud(null,bars,quote(firstNow,bars),firstNow);
 const later=firstNow+3*T,extended=sample(156,later);
 const recovered=advanceCloud(JSON.parse(JSON.stringify(start)),
   extended,quote(later,extended),later);
 assertNextCloudSnapshot(start,recovered,later);
 assert.equal(recovered.status,'GAP_SKIPPED');
 assert.equal(recovered.skippedIntervals,2);
 assert.ok(recovered.sessions.every(s=>s.events.length===0));
});
test('a forged duplicated restart run counter is blocked before publishing',()=>{
 const bars=sample(150,firstNow),start=advanceCloud(null,bars,quote(firstNow,bars),firstNow);
 const same=advanceCloud(start,bars,quote(firstNow+1000,bars),firstNow+1000);
 const broken=JSON.parse(JSON.stringify(same));broken.runCount=start.runCount;
 assert.throws(()=>assertNextCloudSnapshot(start,broken,firstNow+1000),
   /Nonmonotonic/);
});
