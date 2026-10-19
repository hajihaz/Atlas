import test from 'node:test';
import assert from 'node:assert/strict';
import {STRATEGIES,decision} from '../lib/research-engine.js';
import {createPaperGroup,advancePaperGroup,pausePaperGroup,
 resumePaperGroup,summarizePaperGroup} from '../src/lib/paperEngine.js';

const start=Date.parse('2026-10-19T10:00:00Z'),minute=60000;
const make=(i)=>{const close=50000+Math.sin(i/4)*600+i*5;
 return {time:start+i*minute,open:close-10,close,high:close+15,
  low:close-20,volume:2+i/100};};
const bars=Array.from({length:90},(_,i)=>make(i));
test('five independent virtual strategies begin with precisely modeled INR capital',()=>{
 const p=createPaperGroup('BTCINR',start+80*minute);
 assert.equal(p.mode,'LOCAL_FORWARD_PAPER_TRIAL');
 assert.equal(p.sessions.length,STRATEGIES.length);
 assert.ok(p.sessions.every(s=>s.cash===100000&&s.events.length===0));
 assert.equal(p.realOrdersEnabled,false);
 assert.throws(()=>createPaperGroup('NSE:RELIANCE'));
});
test('no trade, quote or value is invented when provider quote is stale',()=>{
 const at=start+89*minute+1000;
 const p=createPaperGroup('BTCINR',at-20000);
 const advanced=advancePaperGroup(p,bars,{symbol:'BTCINR',currency:'INR',
   price:50000,sourceAt:new Date(at-200000).toISOString()},at);
 assert.equal(advanced,p);
});
test('latest source quote may update virtual mark, with idempotent candle cursor',()=>{
 const closedAt=bars.at(-1).time+minute;
 const at=closedAt+2000;
 const p=createPaperGroup('BTCINR',closedAt-25000);
 const q={symbol:'BTCINR',currency:'INR',price:bars.at(-1).close,
   sourceAt:new Date(at-1000).toISOString()};
 const run=advancePaperGroup(p,bars,q,at);
 assert.ok(run.sessions.every(s=>s.lastProcessedClose===closedAt));
 const replay=advancePaperGroup(run,bars,q,at);
 assert.deepEqual(replay.sessions.map(s=>s.events),run.sessions.map(s=>s.events));
 assert.ok(run.sessions.every(s=>s.equityINR>=0));
});
test('gaps longer than 3 minutes halt virtual trials; no catch-up fabricated fills',()=>{
 const at=bars.at(-1).time+minute+500;
 const group=createPaperGroup('BTCINR',start+78*minute);
 const quote={symbol:'BTCINR',currency:'INR',price:50000,
  sourceAt:new Date(at-100).toISOString()};
 const after=advancePaperGroup(group,bars,quote,at);
 assert.ok(after.sessions.every(s=>s.status==='paused'));
 assert.ok(after.sessions.every(s=>s.events.length===0));
 assert.ok(after.sessions.every(s=>s.pausedReason==='unobserved_candle_gap'));
});
test('pause, resume and local JSON serialization preserve simulated-only controls',()=>{
 const p=createPaperGroup('ETHINR',start+minute);
 const paused=pausePaperGroup(p);
 assert.ok(paused.sessions.every(s=>s.status==='paused'));
 const roundtripped=JSON.parse(JSON.stringify(paused));
 const running=resumePaperGroup(roundtripped,start+10*minute);
 assert.ok(running.sessions.every(s=>s.status==='running'));
 assert.equal(running.realOrdersEnabled,false);
 assert.equal(summarizePaperGroup(running).length,5);
});
test('signals require strictly historical input, never a future candle or broker',()=>{
 for(const s of STRATEGIES){
  const previous=decision(s.id,bars,bars.length-2);
  const mutated=[...bars.slice(0,-1),{...bars.at(-1),close:95000,high:95010}];
  assert.equal(decision(s.id,mutated,bars.length-2),previous);
 }
});
