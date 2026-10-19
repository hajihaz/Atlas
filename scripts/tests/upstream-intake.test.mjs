import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyAuditManifest,findUnapprovedImports,checkRepo}
  from '../check_upstream_intake.mjs';
const manifest=JSON.parse(readFileSync(new URL('../../docs/operations/atlas-open-source-audit.json',import.meta.url),'utf8'));
const copy=()=>structuredClone(manifest);

test('ten pinned source-reviewed candidates have licensing, cost and action gates',()=>{
  assert.equal(manifest.upstream.length,10);
  assert.deepEqual(verifyAuditManifest(manifest),[]);
  assert.equal(manifest.realCapitalEnabled,false);
  assert.equal(new Set(manifest.upstream.map(x=>x.repository)).size,10);
  assert.equal(manifest.upstream.every(x=>x.pinnedCommit.length===40),true);
  assert.equal(manifest.upstream.every(x=>x.installedByThisAudit===false),true);
  assert.equal(manifest.upstream.every(x=>x.directInstallApproved===false),true);
});
test('commercial or model-rights holds fail if someone silently lifts them',()=>{
 for(const id of ['freqtrade','vectorbt','finbert']){
  const draft=copy();draft.upstream.find(x=>x.id===id).decision='REFERENCE_ONLY';
  assert.ok(verifyAuditManifest(draft).some(x=>x.includes(id)));
 }
});
test('unapproved dependency or live-trading enablement fails validation',()=>{
 const d=copy();d.upstream[0].directInstallApproved=true;
 assert.ok(verifyAuditManifest(d).some(x=>x.includes('authorization')));
 const p=copy();p.upstream[0].pinnedCommit='main';
 assert.ok(verifyAuditManifest(p).some(x=>x.includes('unpinned')));
 const q=copy();q.realCapitalEnabled=true;
 assert.ok(verifyAuditManifest(q).length>0);
});
test('dependency-intake scanner ignores comments but finds python and node package imports',()=>{
 const dir=mkdtempSync(join(tmpdir(),'atlas-upstream-test-'));
 try{
  const f=join(dir,'sample.py');
  writeFileSync(f,'# import freqtrade\nfrom freqtrade.optimize import X\n');
  assert.ok(findUnapprovedImports([f]).some(x=>x.includes('freqtrade')));
  const j=join(dir,'sample.mjs');
  writeFileSync(j,'import x from "vectorbt";\n');
  assert.ok(findUnapprovedImports([j]).some(x=>x.includes('vectorbt')));
  writeFileSync(j,'// import x from "vectorbt";\nimport {ok} from "./local.js";\n');
  assert.deepEqual(findUnapprovedImports([j]),[]);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Atlas core and browser code have no new upstream package imports',()=>{
 assert.deepEqual(checkRepo(),[]);
});
