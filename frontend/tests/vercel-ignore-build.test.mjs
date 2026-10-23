import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {decideBuild,getChanges} from '../vercel-ignore.mjs';

const data=['frontend/public/cloud-paper.json'];
const paperLive={vercelEnv:'production',hasPrivatePaperToken:true};
const noToken={vercelEnv:'production',hasPrivatePaperToken:false};
test('only paper snapshots may skip when the private server route is enabled',()=>{
 assert.deepEqual(decideBuild(data,paperLive),{skip:true,reason:'live_private_paper_source_configured'});
 assert.equal(decideBuild([...data,'frontend/public/cloud-paper-daybook.json'],paperLive).skip,true);
 assert.equal(decideBuild(data,noToken).skip,false);
 assert.equal(decideBuild(data,{vercelEnv:'preview',hasPrivatePaperToken:false}).skip,false);
 assert.equal(decideBuild(data,{...paperLive,forceBuild:true}).skip,false);
});
test('IPO feeds, orders, JS, APIs, config, tests and cloud source logic NEVER silently skip',()=>{
 for(const file of [
  'frontend/public/ipo-feed.json','frontend/public/ipo-accuracy.json',
  'frontend/src/components/CloudPaperCard.tsx','frontend/api/cloud-paper.js',
  'frontend/src/App.tsx','frontend/vercel.json','.github/workflows/atlas-paper-scheduled.yml',
  'scripts/run_scheduled_paper.mjs','frontend/tests/ipo-intelligence.test.mjs',
  'research/nse-certification/certify.mjs','AGENTS.md'
 ]){
  assert.equal(decideBuild([file],paperLive).skip,false,file);
  assert.equal(decideBuild([file,...data],paperLive).skip,false,file);
 }
});
test('docs-only edits may skip, but mixed docs plus code always build',()=>{
 assert.equal(decideBuild(['README.md','docs/operations/status.md'],noToken).skip,true);
 assert.equal(decideBuild(['docs/operations/status.md','frontend/src/App.tsx'],noToken).skip,false);
 assert.equal(decideBuild(['docs/a.txt','frontend/public/ipo-feed.json'],paperLive).skip,false);
});
test('unknown build context, malformed git paths and empty changes fail open to build',()=>{
 for(const paths of [null,undefined,[],[''],['../frontend/public/cloud-paper.json'],
  ['frontend/public/cloud-paper.json\nfrontend/src/App.tsx'],[24]]){
  assert.equal(decideBuild(paths,paperLive).skip,false,JSON.stringify(paths));
 }
 assert.equal(decideBuild(data,{vercelEnv:''}).skip,false);
 assert.equal(decideBuild(data,{vercelEnv:'production',hasPrivatePaperToken:true,forceBuild:true}).skip,false);
});
test('actual Git changes are detected including source outside frontend root',()=>{
 const root=mkdtempSync(join(tmpdir(),'atlas-ignore-git-'));
 try{
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
  git('init','-q');
  git('config','user.name','Atlas CI test');
  git('config','user.email','atlas-ci@example.invalid');
  mkdirSync(join(root,'frontend/public'),{recursive:true});
  writeFileSync(join(root,'frontend/public/cloud-paper.json'),'{}\n');
  git('add','.');git('commit','-qm','initial');
  writeFileSync(join(root,'frontend/public/cloud-paper.json'),'{"runCount":1}\n');
  git('add','.');git('commit','-qm','data-only');
  assert.deepEqual(getChanges('git',join(root,'frontend')),data);
  assert.equal(decideBuild(getChanges('git',root),paperLive).skip,true);
  mkdirSync(join(root,'frontend/src'),{recursive:true});
  writeFileSync(join(root,'frontend/src/App.tsx'),'export default null;');
  git('add','.');git('commit','-qm','code change');
  assert.deepEqual(getChanges('git',join(root,'frontend')),['frontend/src/App.tsx']);
  assert.equal(decideBuild(getChanges('git',join(root,'frontend')),paperLive).skip,false);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('missing commit parent cannot be treated as successful skip',()=>{
 const root=mkdtempSync(join(tmpdir(),'atlas-ignore-root-'));
 try{
  execFileSync('git',['init','-q'],{cwd:root});
  assert.throws(()=>getChanges('git',root));
 }finally{rmSync(root,{recursive:true,force:true})}
});
