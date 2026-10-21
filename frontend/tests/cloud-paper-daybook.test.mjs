import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCloudPaperSummary,istDay} from '../src/lib/cloudPaperDaybook.js';

import {legacyCloudPaperFixture} from './fixtures/legacy-cloud-paper.mjs';
const original=legacyCloudPaperFixture;
const cloned=()=>structuredClone(original());
const pick=report=>buildCloudPaperSummary(report).strategies[0];

test('deployed source ledgers create reproducible, read-only daybook results',()=>{
 const r=cloned(),s=buildCloudPaperSummary(r);
 assert.equal(s.mode,'PUBLIC_READ_ONLY_PAPER_DAYBOOK');
 assert.equal(s.actualCapitalINR,0);
 assert.equal(s.realOrdersEnabled,false);
 assert.equal(s.strategyAccountsAreIndependent,true);
 assert.equal(s.status,r.status);
 assert.equal(s.strategies.length,r.sessions.length);
 for(const v of s.strategies){
  assert.equal(v.virtualCapitalINR,100000);
  assert.equal(v.totalModeledPnlINR,v.virtualEquityINR-100000);
  assert.equal(v.marginBorrowedINR,0);
  assert.equal(v.leverageModel,'NONE');
  assert.equal(v.virtualCashINR,100000);
  assert.equal(v.markedPositionValueINR,0);
  assert.equal(v.modeledUnrealizedResidualINR,0);
  assert.equal(v.observedWinRatePct,null);
  assert.ok(v.days.every(d=>d.dayChangeINR===null||Number.isFinite(d.dayChangeINR)));
  assert.ok(v.days.every(d=>d.events.every(e=>e.note.includes('not a broker'))));
 }
 assert.deepEqual(buildCloudPaperSummary(r),s);
});
test('IST day boundaries are deterministic across browsers, source in UTC',()=>{
 assert.equal(istDay('2026-10-19T18:29:59Z'),'2026-10-19');
 assert.equal(istDay('2026-10-19T18:30:00Z'),'2026-10-20');
 assert.throws(()=>istDay('unknown'),/timestamp/);
});
test('consecutive checkpoint days show equity change from previous day, not profits invented from gaps',()=>{
 const r=cloned();
 if(r.sessions.length!==5) return;
 r.lastRunAt='2026-10-20T22:00:00Z';
 const one=r.sessions[0],at='2026-10-20T20:45:00Z';
 one.equityHistory=[...one.equityHistory,{at,equityINR:101200}];
 one.virtualEquityINR=101200;
 const s=pick(r);
 const newer=s.days.find(d=>d.dayIST==='2026-10-21');
 assert.ok(newer);
 assert.equal(newer.dayChangeINR,1200);
 assert.equal(newer.changeBasis,'PREVIOUS_CALENDAR_DAY_LAST_SNAPSHOT');
 assert.equal(s.totalModeledPnlINR,1200);
 const gap=cloned();gap.lastRunAt='2026-10-22T22:00:00Z';const g=gap.sessions[0];
 g.equityHistory=[...g.equityHistory,
 {at:'2026-10-22T20:45:00Z',equityINR:102000}];
 g.virtualEquityINR=102000;
 const far=pick(gap).days.find(d=>d.dayIST==='2026-10-23');
 assert.equal(far.dayChangeINR,null);
 assert.equal(far.changeBasis,'NOT_ENOUGH_ADJACENT_CHECKPOINTS');
});
test('modeled exits, buys, per-day fees preserve attribution without broker claims',()=>{
 const r=cloned(); if(r.sessions.length!==5)return;
 r.lastRunAt='2026-10-20T22:00:00Z';
 const session=r.sessions[0],at='2026-10-20T20:45:00Z';
 session.events.push(
  {side:'BUY',quoteAt:at,barClosedAt:'2026-10-20T20:00:00Z',
   modeledPriceINR:100,quantity:1,feeINR:0.10,realizedPnlINR:null,
   mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'},
  {side:'SELL',quoteAt:'2026-10-20T21:45:00Z',
   barClosedAt:'2026-10-20T20:00:00Z',modeledPriceINR:101,
   quantity:1,feeINR:0.10,realizedPnlINR:0.8,
   mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'});
 session.realizedPnlINR=0.8;session.closedTrades=1;session.feesINR=0.2;
 session.equityHistory.push({at,equityINR:100000.8});
 session.virtualEquityINR=100000.8;
 const day=pick(r).days.find(d=>d.dayIST==='2026-10-21');
 assert.equal(day.modeledBuys,1);
 assert.equal(day.modeledSells,1);
 assert.equal(day.modeledFeesINR,0.2);
 assert.equal(day.realizedExitPnlINR,0.8);
 assert.equal(day.dayChangeINR,0.8);
 assert.ok(day.events.every(e=>/HYPOTHETICAL/.test(e.note)));
});
test('bad data, duplicate sessions, nonfinite numbers, live-money flags fail closed',()=>{
 const src=cloned();
 const a=cloned();a.realOrdersEnabled=true;
 assert.throws(()=>buildCloudPaperSummary(a),/Untrusted/);
 const b=cloned();b.actualCapitalINR=1;
 assert.throws(()=>buildCloudPaperSummary(b),/Untrusted/);
 const c=cloned();c.sessions.push({...c.sessions[0]});
 assert.throws(()=>buildCloudPaperSummary(c),/Untrusted/);
 if(src.sessions.length){
  const d=cloned();d.sessions[0].virtualEquityINR=NaN;
  assert.throws(()=>buildCloudPaperSummary(d),/Unsafe/);
  const e=cloned();e.sessions[0].equityHistory.push({at:'invalid',equityINR:500});
  assert.throws(()=>buildCloudPaperSummary(e),/Invalid equity/);
  const f=cloned();f.sessions[1].strategyId=f.sessions[0].strategyId;
  assert.throws(()=>buildCloudPaperSummary(f),/Unsafe/);
 }
});
test('unstarted state remains an empty, truthful daybook without virtual fills',()=>{
 const seed=cloned();seed.status='AWAITING_FIRST_RUN';seed.sessions=[];
 const d=buildCloudPaperSummary(seed);
 assert.equal(d.strategies.length,0);
 assert.equal(d.actualCapitalINR,0);
 assert.throws(()=>buildCloudPaperSummary({...seed,status:'RUNNING'}),/Empty running/);
});
test('build/export is tied to source report, and UI has clickable date drilldown',()=>{
 const component=readFileSync(new URL('../src/components/CloudPaperCard.tsx',import.meta.url),'utf8');
 const script=readFileSync(new URL('../../scripts/build_cloud_paper_daybook.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/strategy.css',import.meta.url),'utf8');
 assert.match(component,/buildCloudPaperSummary\(d\)/);
 assert.match(component,/setSelectedDay\(d\.dayIST\)/);
 assert.match(component,/cloud-paper-daybook\.json/);
 assert.match(component,/No adjacent daily closing observations/);
 assert.match(script,/buildCloudPaperSummary\(data\)/);
 assert.match(script,/frontend\/public\/cloud-paper\.json/);
 assert.match(css,/\.cloud-daybook-dates/);
 assert.match(css,/@media\(max-width:640px\)/);
});

test('future, pre-start, non-hypothetical, or impossible source events fail closed',()=>{
 const data=cloned();if(data.sessions.length!==5)return;
 const makeEvent=()=>({side:'SELL',
   quoteAt:'2026-10-19T22:37:32.197Z',barClosedAt:'2026-10-19T22:00:00Z',
   modeledPriceINR:9000000,quantity:0.001,feeINR:9,
   realizedPnlINR:12,mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'});
 const later=cloned();
 later.sessions[0].equityHistory.push({at:'2026-10-25T10:00:00Z',equityINR:200000});
 assert.throws(()=>buildCloudPaperSummary(later),/Invalid equity observation/);
 const future=cloned();
 future.sessions[0].events.push({...makeEvent(),quoteAt:'2026-10-25T10:00:00Z'});
 assert.throws(()=>buildCloudPaperSummary(future),/Invalid modeled event/);
 const tampered=cloned();
 tampered.sessions[0].events.push({...makeEvent(),mode:'BROKER_ORDER'});
 assert.throws(()=>buildCloudPaperSummary(tampered),/Invalid modeled event/);
 const reverseTime=cloned();
 reverseTime.sessions[0].events.push({...makeEvent(),
   barClosedAt:'2026-10-20T22:00:00Z'});
 assert.throws(()=>buildCloudPaperSummary(reverseTime),/Invalid modeled event/);
 const fakeBuy=cloned();
 fakeBuy.sessions[0].events.push({...makeEvent(),side:'BUY',realizedPnlINR:50});
 assert.throws(()=>buildCloudPaperSummary(fakeBuy),/Invalid modeled event/);
 const missingPnl=cloned();
 missingPnl.sessions[0].events.push({...makeEvent(),realizedPnlINR:null});
 assert.throws(()=>buildCloudPaperSummary(missingPnl),/Invalid modeled event/);
 const badWindow=cloned();
 badWindow.lastRunAt='2026-10-18T00:00:00Z';
 assert.throws(()=>buildCloudPaperSummary(badWindow),/Invalid cloud-paper run provenance/);
});

test('win-rate denominator requires recorded exits and is never invented',()=>{
 const r=cloned(),s=r.sessions[0];
 s.closedTrades=4;s.wins=3;
 const row=buildCloudPaperSummary(r).strategies[0];
 assert.equal(row.winningModeledExits,3);
 assert.equal(row.observedWinRatePct,75);
 assert.equal(row.marginBorrowedINR,0);
 const bad=cloned();bad.sessions[0].wins=2;
 assert.throws(()=>buildCloudPaperSummary(bad),/Unsafe strategy/);
});
test('modeled exposure and residual derive from virtual cash and equity only',()=>{
 const r=cloned(),s=r.sessions[0];
 s.cashINR=70000;s.quantity=0.005;s.virtualEquityINR=101500;
 s.realizedPnlINR=250;
 const v=buildCloudPaperSummary(r).strategies[0];
 assert.equal(v.virtualCashINR,70000);
 assert.equal(v.markedPositionValueINR,31500);
 assert.equal(v.modeledUnrealizedResidualINR,1250);
 assert.equal(v.marginBorrowedINR,0);
 assert.equal(v.leverageModel,'NONE');
});


test('ChatGPT daybook never backfills earlier uncaptured cloud checks',()=>{
 const r=cloned(),daybook=buildCloudPaperSummary(r);
 assert.equal(daybook.checkpointEvidence.recordedAttempts,0);
 assert.equal(daybook.checkpointEvidence.olderAttemptsWithoutEvidence,r.runCount);
 assert.equal(daybook.checkpointEvidence.newlyModeledFillsInWindow,0);
 assert.equal(daybook.checkpointEvidence.acceptedSourceAttempts,0);
 assert.equal(daybook.actualCapitalINR,0);
 assert.match(daybook.checkpointEvidence.disclaimer,/not reconstructed history/);
});
test('one source-backed published checkpoint appears identically in ChatGPT daybook',()=>{
 const r=cloned();
 const recorded={runCount:r.runCount,at:r.lastRunAt,
  status:'DEGRADED',classification:'SOURCE_REJECTED',
  sourceCode:'CLOSED_CANDLE_TOO_OLD',sourceAccepted:false,
  completedBarAt:r.lastBarClosedAt,candleAgeMinutes:97,
  newModeledFills:0,haltedStrategies:0,skippedIntervals:r.skippedIntervals,
  actualCapitalINR:0,realOrdersEnabled:false};
 r.recentCheckpoints=[recorded]; // Explicit hypothetical fixture, not production.
 const d=buildCloudPaperSummary(r).checkpointEvidence;
 assert.equal(d.recordedAttempts,1);
 assert.equal(d.acceptedSourceAttempts,0);
 assert.equal(d.rejectedSourceAttempts,1);
 assert.equal(d.newlyModeledFillsInWindow,0);
 assert.equal(d.olderAttemptsWithoutEvidence,r.runCount-1);
 assert.deepEqual(d.lastFive,[{runCount:r.runCount,at:r.lastRunAt,
  sourceCode:'CLOSED_CANDLE_TOO_OLD',sourceAccepted:false,
  status:'DEGRADED',newModeledFills:0}]);
});
test('corrupted, missing or future paper evidence cannot be presented as certified results',()=>{
 const r=cloned();
 r.recentCheckpoints=[{runCount:r.runCount,at:r.lastRunAt,
  sourceCode:'SOURCE_FETCH_FAILED',sourceAccepted:false,
  status:'DEGRADED',newModeledFills:0,haltedStrategies:0,
  skippedIntervals:0,realOrdersEnabled:false,actualCapitalINR:0}];
 const poison=[
  x=>{x.recentCheckpoints[0].realOrdersEnabled=true;},
  x=>{x.recentCheckpoints[0].actualCapitalINR=20;},
  x=>{x.recentCheckpoints[0].newModeledFills=-1;},
  x=>{x.recentCheckpoints[0].newModeledFills=6;},
  x=>{x.recentCheckpoints[0].sourceCode='BAD|FAKE';},
  x=>{x.recentCheckpoints[0].runCount++;},
  x=>{x.recentCheckpoints[0].at='2030-10-20T00:00:00.000Z';},
 ];
 for(const mutate of poison){
  const f=structuredClone(r);mutate(f);
  assert.throws(()=>buildCloudPaperSummary(f),/evidence/);
 }
});

// The real report is validated separately, without changing it or assuming its
// counter, event count, source status, or retained proof window stays fixed.
test('current published ledger remains readable as genuine checkpoints accumulate',()=>{
 const report=JSON.parse(readFileSync(new URL('../public/cloud-paper.json',import.meta.url),'utf8'));
 const summary=buildCloudPaperSummary(report);
 assert.equal(summary.runCount,report.runCount);
 assert.equal(summary.checkpointEvidence.recordedAttempts,report.recentCheckpoints?.length??0);
 assert.equal(summary.realOrdersEnabled,false);
 assert.equal(summary.actualCapitalINR,0);
});
