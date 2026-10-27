import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{testing} from '../src/index.js';
const ist=(day,clock)=>Date.parse(`${day}T${clock}+05:30`);
test('India market open/close and weekends',()=>{
 assert.equal(testing.session(ist('2026-10-27','09:14:00')),false);
 assert.equal(testing.session(ist('2026-10-27','09:15:00')),true);
 assert.equal(testing.session(ist('2026-10-27','15:29:00')),true);
 assert.equal(testing.session(ist('2026-10-27','15:30:00')),false);
 assert.equal(testing.session(ist('2026-10-31','10:00:00')),false);
});
test('reject timezone-naive schedule times',()=>{
 assert.throws(()=>testing.parseDate('2026-10-27T10:00:00'),/timezone/);
 assert.equal(testing.parseDate('2026-10-27T10:00:00+05:30'),ist('2026-10-27','10:00:00'));
});
test('always advertises paper-only and never exposes owner state',async()=>{
 const r=await worker.fetch(new Request('http://x/healthz'),{DB:{}});
 assert.equal((await r.json()).mode,'PAPER_ONLY');
 const u=await worker.fetch(new Request('http://x/api/cloud-paper/state'),{DB:{},OWNER_TOKEN:'a'.repeat(64)});
 assert.equal(u.status,401);
 const no=await worker.fetch(new Request('http://x/api/cloud-paper/state'),{});
 assert.equal(no.status,503);
});
