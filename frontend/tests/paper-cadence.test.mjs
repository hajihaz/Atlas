import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPaperCadence} from '../src/lib/paperCadence.js';
const at=(x)=>Date.parse(x);
test('cron 17 minutes past even UTC hours renders 5:47 AM IST, not 4:47',()=>{
 const state=assessPaperCadence('2026-10-19T22:37:32Z',at('2026-10-19T23:14:00Z'));
 assert.equal(state.nextDueAt,'2026-10-20T00:17:00.000Z');
 assert.equal(state.overdue,false);
 assert.equal(state.state,'CHECKPOINT_SAVED');
});
test('no new published checkpoint long after a nominal slot is marked late, not failed',()=>{
 const s=assessPaperCadence('2026-10-19T22:37:32Z',at('2026-10-20T01:10:00Z'));
 assert.equal(s.lastDueAt,'2026-10-20T00:17:00.000Z');
 assert.equal(s.overdue,true);
 assert.equal(s.state,'LATE_OR_NOT_PUBLISHED');
});
test('grace window, midnight and no source status remain honest',()=>{
 const during=assessPaperCadence(null,at('2026-10-20T00:45:00Z'));
 assert.equal(during.overdue,false);
 assert.equal(during.state,'AWAITING_FIRST_RUN');
 const missed=assessPaperCadence(null,at('2026-10-20T01:05:00Z'));
 assert.equal(missed.overdue,true);
 assert.equal(missed.nextDueAt,'2026-10-20T02:17:00.000Z');
 const bad=assessPaperCadence('2026-10-20T03:00:00Z',at('2026-10-20T01:05:00Z'));
 assert.equal(bad.state,'INVALID_FUTURE_SNAPSHOT');
 assert.equal(bad.overdue,false);
});
