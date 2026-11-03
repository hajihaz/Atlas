import test from 'node:test';
import assert from 'node:assert/strict';
import {forwardXDecision} from '../src/forward-x-decision.js';
const day='2026-11-04',open=Date.parse(day+'T03:45:00Z'),now=Date.parse(day+'T04:25:12Z'); // 09:55:12
const hash='a'.repeat(64);
const seed=Array.from({length:25},(_,i)=>({time:open+i*60000,open:100,high:101,low:99,close:100,volume:1000}));
const window=Array.from({length:5},(_,i)=>({time:open+(35+i)*60000,open:101,high:103,low:100,close:i===4?102:101,
 volume:2000,sourceSha256:hash,knownAt:open+(36+i)*60000+10000}));
const nifty=[{time:open,open:20000,sourceSha256:hash,knownAt:open+70000},
 {time:open+14*60000,close:20050,sourceSha256:hash,knownAt:open+15*60000+10000}];
const roster={day,eligibleCount:1376,knownAt:Date.parse(day+'T04:10:30Z'),top:[{symbol:'RELIANCE'},...Array.from({length:9},(_,i)=>({symbol:`S${i}`}))]};
const input={day,symbol:'RELIANCE',roster,seed,window,nifty,now};
test('qualified completed bar produces a forward signal without a fill',()=>{
 const result=forwardXDecision(input);
 assert.equal(result.status,'SIGNAL');assert.equal(result.side,'BUY');assert.equal(result.niftyBps,25);
 assert.equal(result.paperOnly,true);assert.equal(result.realOrdersEnabled,false);
 assert.equal(Object.hasOwn(result,'fill'),false);
});
test('neutral index or unconfirmed five-minute close has an explicit no-trade reason',()=>{
 assert.equal(forwardXDecision({...input,nifty:[nifty[0],{...nifty[1],close:20010}]}).reason,'NIFTY_NEUTRAL');
 assert.equal(forwardXDecision({...input,window:window.map((x,i)=>i===4?{...x,close:100.5}:x)}).reason,'NO_CONFIRMED_BREAKOUT');
});
test('late bar, missing opening bar and future roster fail closed',()=>{
 assert.throws(()=>forwardXDecision({...input,window:window.map((x,i)=>i===4?{...x,knownAt:now+1}:x)}),/completed five minute window/);
 assert.throws(()=>forwardXDecision({...input,seed:seed.slice(1)}),/completed five minute window/);
 assert.throws(()=>forwardXDecision({...input,roster:{...roster,knownAt:Date.parse(day+'T04:11:00Z')}}),/09:40 roster/);
});
