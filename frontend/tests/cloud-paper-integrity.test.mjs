import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyCloudPaperFixture} from './fixtures/legacy-cloud-paper.mjs';
import {assertNextCloudSnapshot} from '../../scripts/paper_ledger_guard.mjs';
import {failureState,freshState} from '../../scripts/scheduled_paper_engine.mjs';
const original=legacyCloudPaperFixture;
const copy=x=>structuredClone(x);
test('published paper ledger accepts a genuinely recorded no-trade retry',()=>{
 const from=original();assert.equal(from.sessions.length,5);
 const at=Date.parse(from.lastRunAt)+10_000;
 const next=failureState(from,'provider lost',at);
 assert.equal(assertNextCloudSnapshot(from,next,at),true);
 assert.ok(next.sessions.every(s=>s.events.length===0));
});
test('a repeated completed candle cannot produce another synthetic BUY',()=>{
 const old=original(),at=Date.parse(old.lastRunAt)+20_000;
 const next=copy(old);next.runCount++;next.lastRunAt=new Date(at).toISOString();
 next.status='RUNNING'; // Synthetic accepted-source context for replay test.
 next.sessions[0].events.push({side:'BUY',quoteAt:new Date(at).toISOString(),
  barClosedAt:old.lastBarClosedAt,modeledPriceINR:8e6,
  quantity:0.012,feeINR:100,realizedPnlINR:null,
  mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'});
 assert.throws(()=>assertNextCloudSnapshot(old,next,at),/Duplicate modeled fill/);
});
test('repeated snapshots are monotonic and never authorize real orders',()=>{
 const old=original(),at=Date.parse(old.lastRunAt)+10_000;
 for(const mutate of [
  n=>{n.runCount=old.runCount;},
  n=>{n.realOrdersEnabled=true;},
  n=>{n.actualCapitalINR=10;},
  n=>{n.lastRunAt=new Date(at+100_000).toISOString();},
  n=>{n.sessions[0].cashINR=-1;},
  n=>{n.sessions=[];},
  n=>{n.lastBarClosedAt='2020-01-01T00:00:00Z';},
  n=>{n.sessions[0].strategyId=n.sessions[1].strategyId;},
 ]){
  const n=copy(old);n.runCount++;n.lastRunAt=new Date(at).toISOString();
  mutate(n);assert.throws(()=>assertNextCloudSnapshot(old,n,at));
 }
});
test('never backfill virtual entry orders into a first-run portfolio',()=>{
 const old=original(),now=Date.parse(old.lastRunAt);
 const seed={...old,sessions:[],runCount:0,lastRunAt:null,createdAt:null,
  lastBarClosedAt:null,status:'AWAITING_FIRST_RUN'};
 const next=freshState('BTCINR',Date.parse(old.lastBarClosedAt),now,
  {symbol:'BTCINR',sourceAt:new Date(now).toISOString()});
 assert.equal(assertNextCloudSnapshot(seed,next,now),true);
 const fake=copy(next);fake.sessions[0].quantity=1;
 assert.throws(()=>assertNextCloudSnapshot(seed,fake,now),/backfill fills/);
});
test('duplicate trades for the same strategy/source candle are rejected',()=>{
 const old=original(),now=Date.parse(old.lastRunAt)+7200000;
 const trial=copy(old);trial.runCount++;trial.lastRunAt=new Date(now).toISOString();
 trial.lastBarClosedAt=new Date(Date.parse(old.lastBarClosedAt)+7200000).toISOString();
 const ev={side:'BUY',quoteAt:new Date(now).toISOString(),
  barClosedAt:trial.lastBarClosedAt,modeledPriceINR:8e6,
  quantity:0.01,feeINR:80,realizedPnlINR:null,
  mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'};
 trial.sessions[0].events.push(ev,ev);
 assert.throws(()=>assertNextCloudSnapshot(old,trial,now),/duplicate virtual fill/i);
 trial.sessions[0].events.splice(1,1);
 trial.status='GAP_SKIPPED';
 assert.throws(()=>assertNextCloudSnapshot(old,trial,now),/Fills forbidden/);
});

test('rolling 120-event window preserves every retained event except oldest',()=>{
 const old=original(),prior=Date.parse(old.lastBarClosedAt);
 const sourceRows=Array.from({length:120},(_,i)=>{
  const close=new Date(prior-(119-i)*7200000).toISOString();
  return {side:i%2?'SELL':'BUY',quoteAt:new Date(Date.parse(close)+10000).toISOString(),
   barClosedAt:close,modeledPriceINR:900000+i,quantity:0.01,
   feeINR:8,realizedPnlINR:i%2?5:null,
   mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'};
 });
 old.sessions[0].events=sourceRows;
 const now=Date.parse(old.lastRunAt)+7200000;
 const next=copy(old);next.runCount++;next.lastRunAt=new Date(now).toISOString();
 next.status='RUNNING'; // Explicit source recovery; never permit fills in DEGRADED.
 next.lastBarClosedAt=new Date(prior+7200000).toISOString();
 const fresh={side:'BUY',quoteAt:new Date(now-1000).toISOString(),
  barClosedAt:next.lastBarClosedAt,modeledPriceINR:990000,
  quantity:0.01,feeINR:10,realizedPnlINR:null,
  mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'};
 next.sessions[0].events=[...sourceRows.slice(1),fresh];
 assert.equal(assertNextCloudSnapshot(old,next,now),true);
 const tamper=copy(next);
 tamper.sessions[0].events[52].modeledPriceINR+=100;
 assert.throws(()=>assertNextCloudSnapshot(old,tamper,now),/rolling window changed/);
 const wrongBar=copy(next);
 wrongBar.sessions[0].events[119].barClosedAt=
   new Date(prior+3600000).toISOString();
 assert.throws(()=>assertNextCloudSnapshot(old,wrongBar,now),
   /not tied to the new source candle/);
 const wrongClock=copy(next);
 wrongClock.sessions[0].events[119].quoteAt=
   new Date(now+600000).toISOString();
 assert.throws(()=>assertNextCloudSnapshot(old,wrongClock,now),
   /not tied to the new source candle/);
});

test('no-fill cloud checkpoint cannot mint virtual cash, fees, positions or gains',()=>{
 const before=original(),now=Date.parse(before.lastRunAt)+30000;
 const baseline=failureState(before,'missing source',now);
 assert.equal(assertNextCloudSnapshot(before,baseline,now),true);
 const bad=[
  next=>{next.sessions[0].cashINR+=250;},
  next=>{next.sessions[0].quantity=0.01;},
  next=>{next.sessions[0].costINR+=50;},
  next=>{next.sessions[0].feesINR+=25;},
  next=>{next.sessions[0].realizedPnlINR+=500;},
  next=>{next.sessions[0].closedTrades++;},
  next=>{next.sessions[0].wins++;},
  next=>{next.sessions[0].lastFillAt=new Date(now).toISOString();},
  next=>{next.status='EXECUTING_REAL_ORDER';}
 ];
 for(const change of bad){
  const next=structuredClone(baseline);
  change(next);
  assert.throws(()=>assertNextCloudSnapshot(before,next,now),
   /No modeled fill can change virtual holdings or P\/L|Unrecognized modeled-paper run status|Degraded source must preserve/);
 }
});
test('a no-fill risk revaluation may update equity, not create realized profit',()=>{
 const before=original(),now=Date.parse(before.lastRunAt)+30000;
 const next=failureState(before,'risk-marking-only',now);
 next.status='RUNNING'; // Explicitly source-accepted hypothetical revaluation fixture.
 const row=next.sessions[0];
 next.sessions[0]={...row,virtualEquityINR:row.virtualEquityINR-50,
  maxDrawdownPct:Math.max(row.maxDrawdownPct,0.05)};
 assert.equal(assertNextCloudSnapshot(before,next,now),true);
 assert.equal(next.sessions[0].cashINR,before.sessions[0].cashINR);
});

test('provider-degraded cloud attempts cannot revalue cash-free equity either',()=>{
 const before=original(),now=Date.parse(before.lastRunAt)+30000;
 const fail=failureState(before,'no valid source',now);
 const forged=structuredClone(fail);
 forged.sessions[0].virtualEquityINR+=10000;
 assert.throws(()=>assertNextCloudSnapshot(before,forged,now),
  /Degraded source must preserve prior virtual portfolio exactly/);
 const replay=structuredClone(fail);
 replay.sessions[0].equityHistory.push({
  at:new Date(now).toISOString(),equityINR:replay.sessions[0].virtualEquityINR});
 assert.throws(()=>assertNextCloudSnapshot(before,replay,now),
  /Degraded source must preserve prior virtual portfolio exactly/);
});
