import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {failureState} from '../../scripts/scheduled_paper_engine.mjs';
import {describePaperRun,renderPaperRunHealthMarkdown}
 from '../../scripts/paper_run_health.mjs';
const source=()=>JSON.parse(readFileSync(new URL('../public/cloud-paper.json',import.meta.url),'utf8'));
const copy=x=>structuredClone(x);
const shifted=before=>{
 const n=copy(before);n.runCount++;
 n.lastRunAt=new Date(Date.parse(before.lastRunAt)+10000).toISOString();
 return n;
};
test('a safe failed provider check reports a GitHub warning, not a virtual trade',()=>{
 const before=source(),now=Date.parse(before.lastRunAt)+10000;
 const next=failureState(before,'missing public quote',now);
 next.lastSourceCheck={schema:1,status:'BLOCKED',code:'QUOTE_TOO_OLD',
  candleAgeMinutes:77,latencyClass:'RECENT_OR_UNVERIFIED'};
 const health=describePaperRun(before,next);
 assert.equal(health.classification,'SOURCE_REJECTED');
 assert.equal(health.sourceAccepted,false);
 assert.equal(health.newlyModeledFills,0);
 assert.equal(health.actualCapitalINR,0);
 assert.equal(health.realOrdersEnabled,false);
 const markdown=renderPaperRunHealthMarkdown(health);
 assert.match(markdown,/QUOTE_TOO_OLD/);
 assert.match(markdown,/A green GitHub job only confirms safe execution/);
 assert.match(markdown,/Real capital \| ₹0/);
});
test('valid public market observation without signal records zero modeled fills',()=>{
 const before=source(),next=shifted(before);
 next.status='RUNNING';
 next.lastSourceCheck={schema:1,status:'PASS',code:'ELIGIBLE',
  candleAgeMinutes:77,latencyClass:'DELAYED_PAPER_ONLY'};
 const h=describePaperRun(before,next);
 assert.equal(h.classification,'SOURCE_VERIFIED_PAPER_ONLY');
 assert.equal(h.newlyModeledFills,0);
 assert.equal(h.latencyClass,'DELAYED_PAPER_ONLY');
 assert.match(renderPaperRunHealthMarkdown(h),/\*\*0\*\*/);
});
test('missed source bars, risk halts and first invalid seed are clear',()=>{
 const before=source(),gap=shifted(before);
 gap.status='GAP_SKIPPED';gap.skippedIntervals=(gap.skippedIntervals??0)+2;
 gap.lastSourceCheck={status:'PASS',code:'ELIGIBLE'};
 const h=describePaperRun(before,gap);
 assert.equal(h.classification,'SKIPPED_SOURCE_INTERVALS');
 assert.equal(h.skippedIntervals,gap.skippedIntervals);
 const halt=shifted(before);halt.sessions[0].status='HALTED';
 assert.equal(describePaperRun(before,halt).classification,'VIRTUAL_RISK_HALTED');
 const awaiting={...shifted(before),sessions:[],status:'AWAITING_VALID_SOURCE'};
 assert.equal(describePaperRun(before,awaiting).classification,'SOURCE_NOT_INITIALIZED');
});
test('unsafe market statuses, invented events and malformed report are rejected',()=>{
 const before=source(),bad=shifted(before);
 bad.status='DEGRADED';
 bad.sessions[0].events.push({side:'BUY',barClosedAt:'2026-10-20T02:00:00Z'});
 assert.throws(()=>describePaperRun(before,bad),/New model fill on unsafe runner status/);
 bad.actualCapitalINR=1;
 assert.throws(()=>describePaperRun(before,bad),/Unsafe paper research snapshot/);
});
test('GitHub markdown summary sanitizes source content',()=>{
 const before=source(),next=shifted(before);
 next.status='DEGRADED';
 next.lastSourceCheck={status:'BLOCKED',code:'BAD\\n| Fake trades | 900 |'};
 const note=renderPaperRunHealthMarkdown(describePaperRun(before,next));
 assert.doesNotMatch(note,/\n\| Fake trades \|/);
 assert.match(note,/Model accounts/);
});
