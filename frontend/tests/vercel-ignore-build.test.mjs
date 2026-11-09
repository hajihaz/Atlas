import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decideBuild,getChanges} from '../vercel-ignore.mjs';

const paper=['frontend/public/cloud-paper.json'];
const production={vercelEnv:'production',gitRef:'main',
 hasPreviousDeployment:true,hasPrivatePaperToken:true};
const noToken={...production,hasPrivatePaperToken:false};

test('PR preview always builds, even when HEAD changes only docs or paper',()=>{
 for(const gitRef of ['feature/example','haor/atlas-consolidated-20261023','main']){
  for(const changed of [paper,['README.md','docs/release.md']]){
   assert.equal(decideBuild(changed,{...production,vercelEnv:'preview',gitRef}).skip,false);
  }
 }
 assert.equal(decideBuild(['docs/a.md'],{...production,gitRef:'feature/a'}).skip,false);
 assert.equal(decideBuild(['docs/a.md'],{...production,hasPreviousDeployment:false}).skip,false);
});

test('production/main data-only skip requires verified baseline and live read-only source',()=>{
 assert.deepEqual(decideBuild(paper,production),
   {skip:true,reason:'live_private_paper_source_configured'});
 assert.equal(decideBuild([...paper,'frontend/public/cloud-paper-daybook.json'],production).skip,true);
 assert.equal(decideBuild(paper,noToken).skip,false);
 assert.equal(decideBuild(paper,{...production,hasPreviousDeployment:false}).skip,false);
 assert.equal(decideBuild(paper,{...production,forceBuild:true}).skip,false);
});

test('IPO, runtime, CI, framework, research edits always require build',()=>{
 for(const changed of [
  'frontend/public/ipo-feed.json','frontend/public/ipo-accuracy.json',
  'frontend/src/components/CloudPaperCard.tsx','frontend/api/cloud-paper.js','frontend/api/cloud-paper-snapshot.js',
  'frontend/src/App.tsx','frontend/vercel.json','.github/workflows/atlas-paper-scheduled.yml',
  'scripts/run_scheduled_paper.mjs','frontend/tests/ipo-intelligence.test.mjs',
  'research/nse-certification/certify.mjs','AGENTS.md',
 ]){
  assert.equal(decideBuild([changed],production).skip,false,changed);
  assert.equal(decideBuild([changed,...paper],production).skip,false,changed);
 }
});

test('docs-only may skip only on verified production main history',()=>{
 assert.equal(decideBuild(['README.md','docs/operations/status.md'],noToken).skip,true);
 assert.equal(decideBuild(['README.md'],{...noToken,hasPreviousDeployment:false}).skip,false);
 assert.equal(decideBuild(['README.md'],{...noToken,gitRef:'other'}).skip,false);
 assert.equal(decideBuild(['docs/operations/status.md','frontend/src/App.tsx'],noToken).skip,false);
});

test('invalid changed paths and missing history always build',()=>{
 for(const changed of [null,undefined,[],[''],['../frontend/public/cloud-paper.json'],
  ['frontend/public/cloud-paper.json\nfrontend/src/App.tsx'],[24]]){
  assert.equal(decideBuild(changed,production).skip,false,JSON.stringify(changed));
 }
 assert.equal(decideBuild(paper,{...production,vercelEnv:''}).skip,false);
 assert.equal(decideBuild(paper,{...production,forceBuild:true}).skip,false);
});

test('real Git: inspect ALL commits since last deployed, not just latest docs commit',()=>{
 const root=mkdtempSync(join(tmpdir(),'atlas-vercel-history-'));
 try{
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  git('init','-q');
  git('config','user.name','Atlas CI test');
  git('config','user.email','atlas-ci@example.invalid');
  mkdirSync(join(root,'frontend/public'),{recursive:true});
  writeFileSync(join(root,'frontend/public/cloud-paper.json'),'{}\n');
  git('add','.');git('commit','-qm','original published deployment');
  const published=git('rev-parse','HEAD');

  writeFileSync(join(root,'frontend/public/cloud-paper.json'),'{"runCount":1}\n');
  git('add','.');git('commit','-qm','paper-only change');
  const afterPaper=git('rev-parse','HEAD');
  assert.deepEqual(getChanges('git',join(root,'frontend'),published),paper);
  assert.equal(decideBuild(getChanges('git',root,published),production).skip,true);

  mkdirSync(join(root,'frontend/src'),{recursive:true});
  writeFileSync(join(root,'frontend/src/App.tsx'),'export default null;');
  git('add','.');git('commit','-qm','runtime code change');
  const afterCode=git('rev-parse','HEAD');
  mkdirSync(join(root,'docs'),{recursive:true});
  writeFileSync(join(root,'docs/release.md'),'test release notes');
  git('add','.');git('commit','-qm','last commit docs only');

  assert.deepEqual(getChanges('git',root,afterCode),['docs/release.md']);
  assert.equal(decideBuild(getChanges('git',root,afterCode),noToken).skip,true);

  // A code build has NOT completed since afterPaper. Thus full cumulative
  // comparison must include both code and docs and MUST build.
  const cumulative=getChanges('git',join(root,'frontend'),afterPaper);
  assert.ok(cumulative.includes('frontend/src/App.tsx'));
  assert.ok(cumulative.includes('docs/release.md'));
  assert.equal(decideBuild(cumulative,production).skip,false);

  const all=getChanges('git',root,published);
  assert.ok(all.includes('frontend/public/cloud-paper.json'));
  assert.ok(all.includes('frontend/src/App.tsx'));
  assert.equal(decideBuild(all,production).skip,false);

  // A SHA outside this repository, malformed ID or unseen/nonancestor history
  // cannot be used to authorize any skip.
  for(const bad of ['','HEAD^','abc','0'.repeat(40)])
   assert.throws(()=>getChanges('git',root,bad));
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('diverged previous deployment SHA never authorizes an ignored build',()=>{
 const root=mkdtempSync(join(tmpdir(),'atlas-diverged-'));
 try{
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  git('init','-q');git('config','user.name','Atlas CI test');
  git('config','user.email','atlas-ci@example.invalid');
  writeFileSync(join(root,'a'),'a');git('add','.');git('commit','-qm','base');
  const base=git('rev-parse','HEAD');
  git('checkout','-qb','other');
  writeFileSync(join(root,'b'),'b');git('add','.');git('commit','-qm','other branch');
  const other=git('rev-parse','HEAD');
  git('checkout','-q','-');
  writeFileSync(join(root,'c'),'c');git('add','.');git('commit','-qm','main branch');
  assert.notEqual(other,base);
  assert.throws(()=>getChanges('git',root,other));
 }finally{rmSync(root,{recursive:true,force:true})}
});
