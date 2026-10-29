import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessPaperCadence} from '../src/lib/paperCadence.js';
const at=x=>Date.parse(x);
test('retired five-strategy workflow cannot schedule or run legacy paper checkpoint',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/atlas-paper-scheduled.yml',import.meta.url),'utf8');
 assert.doesNotMatch(workflow,/^\s*schedule:\s*$/m);
 assert.doesNotMatch(workflow,/^\s*- cron:/m);
 assert.doesNotMatch(workflow,/run: bash scripts\/publish_scheduled_paper\.sh/);
 assert.match(workflow,/ScalpStorm X only/);
 const state=assessPaperCadence('2026-10-19T22:37:32Z',at('2026-10-20T00:14:00Z'));
 assert.equal(state.nextDueAt,'2026-10-20T00:35:00.000Z'); // archived interval math only
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
