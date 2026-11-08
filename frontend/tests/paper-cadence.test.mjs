import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessPaperCadence} from '../src/lib/paperCadence.js';
const at=x=>Date.parse(x);
test('two new UTC candle slots are +35 and +80 minutes, without extra runs',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/atlas-paper-scheduled.yml',import.meta.url),'utf8');
 assert.match(workflow,/cron:\s*'35 0-22\/2 \* \* \*'/);
 assert.match(workflow,/cron:\s*'20 1-23\/2 \* \* \*'/);
 assert.equal((workflow.match(/- cron:/g)||[]).length,2);
 const state=assessPaperCadence('2026-10-19T22:37:32Z',at('2026-10-20T00:14:00Z'));
 assert.equal(state.nextDueAt,'2026-10-20T00:35:00.000Z');
 assert.equal(state.overdue,true); // Prior +70-minute window passed without new ledger
 assert.equal(assessPaperCadence(null,at('2026-10-20T00:40:00Z')).nextDueAt,
  '2026-10-20T01:20:00.000Z');
});
test('ledger freshness hints account for grace, without declaring GitHub failure',()=>{
 const state=assessPaperCadence('2026-10-20T00:35:58Z',at('2026-10-20T01:45:00Z'));
 assert.equal(state.lastDueAt,'2026-10-20T01:20:00.000Z');
 assert.equal(state.overdue,false);
 const missed=assessPaperCadence('2026-10-20T00:35:58Z',at('2026-10-20T02:10:00Z'));
 assert.equal(missed.overdue,true);
 assert.equal(missed.state,'LATE_OR_NOT_PUBLISHED');
 assert.equal(missed.nextDueAt,'2026-10-20T02:35:00.000Z');
});
test('UTC midnight and year boundary remain correct and future clock fails closed',()=>{
 const during=assessPaperCadence(null,at('2026-10-20T00:45:00Z'));
 assert.equal(during.overdue,false);
 assert.equal(during.state,'AWAITING_FIRST_RUN');
 const missed=assessPaperCadence(null,at('2026-10-20T02:10:00Z'));
 assert.equal(missed.overdue,true);
 const across=assessPaperCadence(null,at('2027-01-01T00:05:00Z'));
 assert.equal(across.lastDueAt,'2026-12-31T23:20:00.000Z');
 assert.equal(across.nextDueAt,'2027-01-01T00:35:00.000Z');
 const bad=assessPaperCadence('2026-10-20T04:00:00Z',at('2026-10-20T02:10:00Z'));
 assert.equal(bad.state,'INVALID_FUTURE_SNAPSHOT');
});
