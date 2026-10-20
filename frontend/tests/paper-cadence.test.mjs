import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPaperCadence} from '../src/lib/paperCadence.js';
const at=x=>Date.parse(x);
test('provider-aligned odd UTC slot displays first 6:35 AM IST and second 6:47 AM IST',()=>{
 const state=assessPaperCadence('2026-10-19T22:37:32Z',at('2026-10-20T00:14:00Z'));
 assert.equal(state.nextDueAt,'2026-10-20T01:05:00.000Z');
 assert.equal(state.overdue,true); // Prior UTC date's 23:17 source window was missed
 assert.equal(assessPaperCadence(null,at('2026-10-20T01:10:00Z')).nextDueAt,
  '2026-10-20T01:17:00.000Z');
});
test('late published checkpoint is not assumed to be a failed GitHub job',()=>{
 const state=assessPaperCadence('2026-10-20T01:05:58Z',at('2026-10-20T01:45:00Z'));
 assert.equal(state.lastDueAt,'2026-10-20T01:17:00.000Z');
 assert.equal(state.overdue,false);
 const missed=assessPaperCadence('2026-10-20T01:05:58Z',at('2026-10-20T02:10:00Z'));
 assert.equal(missed.overdue,true);
 assert.equal(missed.state,'LATE_OR_NOT_PUBLISHED');
 assert.equal(missed.nextDueAt,'2026-10-20T03:05:00.000Z');
});
test('odd-hour midnight rollover and unavailable first run remain explicit',()=>{
 const during=assessPaperCadence(null,at('2026-10-20T01:25:00Z'));
 assert.equal(during.overdue,false);
 assert.equal(during.state,'AWAITING_FIRST_RUN');
 const missed=assessPaperCadence(null,at('2026-10-20T02:10:00Z'));
 assert.equal(missed.overdue,true);
 const bad=assessPaperCadence('2026-10-20T04:00:00Z',at('2026-10-20T02:10:00Z'));
 assert.equal(bad.state,'INVALID_FUTURE_SNAPSHOT');
});
