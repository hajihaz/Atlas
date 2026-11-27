import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {readSnapshot} from '../api/research-snapshot.js';

test('public source reader pins the manifest and report to one commit and checks the original clock',async t=>{
  const sha='a'.repeat(40), date='2026-01-02T10:00:00.000Z';
  const body=JSON.stringify({schema:1,mode:'SCHEDULED_VIRTUAL_PAPER',actualCapitalINR:0,realOrdersEnabled:false,lastRunAt:date,sessions:[]});
  const manifest={schema:'atlas.public-research-publication.v1',mode:'PREVIEW_RESEARCH_ONLY',actualCapitalINR:0,realOrdersEnabled:false,
    sha256:{'frontend/public/cloud-paper.json':createHash('sha256').update(body).digest('hex')},sourceClocks:{paper:date}};
  t.mock.method(globalThis,'fetch',async url=>{
    if(url.endsWith('/git/ref/heads/data/atlas-runtime'))return Response.json({ref:'refs/heads/data/atlas-runtime',object:{sha}});
    assert.ok(url.includes('/'+sha+'/frontend/public/'));
    return url.endsWith('runtime-publication.json')?Response.json(manifest):new Response(body);
  });
  assert.equal((await readSnapshot('paper')).sourceAt,date);
  manifest.sourceClocks.paper='2026-01-03T00:00:00Z';
  await assert.rejects(readSnapshot('paper'),/clock/);
  manifest.sha256['frontend/public/cloud-paper.json']='b'.repeat(64);
  await assert.rejects(readSnapshot('paper'),/manifest/);
  await assert.rejects(readSnapshot('seven-accounts'),/invalid feed/);
});
