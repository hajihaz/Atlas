import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {failureState} from '../../scripts/scheduled_paper_engine.mjs';
import {describePaperRun} from '../../scripts/paper_run_health.mjs';
import {assertNextCloudSnapshot} from '../../scripts/paper_ledger_guard.mjs';
import {appendPaperCheckpointEvidence,assertPaperCheckpointContinuity,
 checkpointEvidenceSummary} from '../../scripts/paper_checkpoint_evidence.mjs';
const published=()=>JSON.parse(readFileSync(new URL('../public/cloud-paper.json',import.meta.url),'utf8'));
const iso=x=>new Date(x).toISOString();
function nextAttempt(old,n=1){
 const now=Date.parse(old.lastRunAt)+n*10000;
 const next=failureState(old,'stale quote',now);
 next.lastSourceCheck={schema:1,status:'BLOCKED',code:'QUOTE_TOO_OLD',
  checkedAt:iso(now),latestBarClosedAt:old.lastBarClosedAt,
  providerQuoteAt:iso(now-1000),candleAgeMinutes:77,
  latencyClass:'RECENT_OR_UNVERIFIED',
  liveOrdersEnabled:false,paperOrdersExecuted:false};
 const health=describePaperRun(old,next);
 next.recentCheckpoints=appendPaperCheckpointEvidence(old,next,health);
 return {next,now,health};
}
test('historic run counter is not backfilled into future checkpoint evidence',()=>{
 const before=published();
 assert.equal(before.recentCheckpoints,undefined);
 const {next,now,health}=nextAttempt(before);
 assert.equal(next.runCount,before.runCount+1);
 assert.equal(next.recentCheckpoints.length,1);
 assert.equal(next.recentCheckpoints[0].runCount,next.runCount);
 assert.equal(next.recentCheckpoints[0].classification,'SOURCE_REJECTED');
 assert.equal(next.recentCheckpoints[0].newModeledFills,0);
 assert.equal(health.sourceAccepted,false);
 assert.equal(assertNextCloudSnapshot(before,next,now),true);
 const summary=checkpointEvidenceSummary(next);
 assert.equal(summary.recordedAttempts,1);
 assert.equal(summary.rejectedSourceAttempts,1);
 assert.equal(summary.windowIsPartial,true);
 assert.equal(summary.modeledFillsRecordedInWindow,0);
});
test('only actual sequential new attempts can append to retained published history',()=>{
 const old=published(),first=nextAttempt(old),second=nextAttempt(first.next);
 assert.equal(assertNextCloudSnapshot(first.next,second.next,second.now),true);
 assert.equal(second.next.recentCheckpoints.length,2);
 const deleted=structuredClone(second.next);
 deleted.recentCheckpoints=undefined;
 assert.throws(()=>assertNextCloudSnapshot(first.next,deleted,second.now),
  /checkpoint evidence erased/);
 const changed=structuredClone(second.next);
 changed.recentCheckpoints[0].sourceCode='FAKE_TRADE';
 assert.throws(()=>assertNextCloudSnapshot(first.next,changed,second.now),
  /Historical paper checkpoint evidence changed/);
 const duplicate=structuredClone(second.next);
 duplicate.recentCheckpoints[1].runCount=duplicate.recentCheckpoints[0].runCount;
 assert.throws(()=>assertNextCloudSnapshot(first.next,duplicate,second.now),
  /Nonmonotonic paper checkpoint evidence/);
 const editedRun=structuredClone(second.next);
 editedRun.recentCheckpoints[1].newModeledFills=5;
 assert.throws(()=>assertPaperCheckpointContinuity(first.next,editedRun),
  /Latest checkpoint evidence conflicts|Invalid published paper checkpoint evidence/);
});
test('ring buffer retains precisely the last 24 real subsequent attempts',()=>{
 const begin=published();
 let current=begin;
 for(let i=0;i<29;i++){
  const {next,now}=nextAttempt(current);
  assert.equal(assertNextCloudSnapshot(current,next,now),true);
  current=next;
 }
 const rows=current.recentCheckpoints;
 assert.equal(rows.length,24);
 assert.equal(rows[0].runCount,begin.runCount+6);
 assert.equal(rows.at(-1).runCount,begin.runCount+29);
 assert.equal(checkpointEvidenceSummary(current).recordedAttempts,24);
 assert.ok(rows.every(row=>row.newModeledFills===0));
 assert.ok(rows.every(row=>row.actualCapitalINR===0&&row.realOrdersEnabled===false));
});
test('synthetic accepted no-trade run can be recorded but never called profitable',()=>{
 const before=published(),now=Date.parse(before.lastRunAt)+30000;
 const after=failureState(before,'previously rejected source',now);
 after.status='RUNNING';after.alert=null;
 after.lastSourceCheck={status:'PASS',code:'ELIGIBLE',
  candleAgeMinutes:87,latencyClass:'DELAYED_PAPER_ONLY'};
 const health=describePaperRun(before,after);
 after.recentCheckpoints=appendPaperCheckpointEvidence(before,after,health);
 assert.equal(health.classification,'SOURCE_VERIFIED_PAPER_ONLY');
 assert.equal(health.newlyModeledFills,0);
 assert.equal(assertNextCloudSnapshot(before,after,now),true);
 const summary=checkpointEvidenceSummary(after);
 assert.equal(summary.acceptedSourceAttempts,1);
 assert.equal(summary.modeledFillsRecordedInWindow,0);
});
test('reject forged future, invalid event counts and source metadata',()=>{
 const before=published(),valid=nextAttempt(before);
 const negatives=[
  row=>{row.at=iso(valid.now+60000);},
  row=>{row.sourceCode='REJECTED|FAKE';},
  row=>{row.classification='REAL_PROFIT';},
  row=>{row.newModeledFills=6;},
  row=>{row.actualCapitalINR=5;},
  row=>{row.realOrdersEnabled=true;},
  row=>{row.status='DEGRADED';row.newModeledFills=1;},
 ];
 for(const alter of negatives){
  const after=structuredClone(valid.next);alter(after.recentCheckpoints[0]);
  assert.throws(()=>assertNextCloudSnapshot(before,after,valid.now));
 }
});
