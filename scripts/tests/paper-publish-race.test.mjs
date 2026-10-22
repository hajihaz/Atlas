import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,chmodSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const publisher=resolve('scripts/publish_scheduled_paper.sh');
const realGit=execFileSync('which',['git'],{encoding:'utf8'}).trim();
function git(cwd,...args){
 return execFileSync(realGit,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
}
function sandbox(){
 const root=mkdtempSync(join(tmpdir(),'atlas-paper-race-'));
 const remote=join(root,'remote.git'),repo=join(root,'job'),actor=join(root,'actor');
 git(root,'init','--bare','--initial-branch=main',remote);
 git(root,'clone',remote,repo);
 git(repo,'config','user.name','atlas-test');
 git(repo,'config','user.email','atlas-test@example.test');
 mkdirSync(join(repo,'frontend/public'),{recursive:true});
 mkdirSync(join(repo,'scripts'),{recursive:true});
 writeFileSync(join(repo,'frontend/public/cloud-paper.json'),
  JSON.stringify({runCount:0,realOrdersEnabled:false,actualCapitalINR:0})+'\n');
 writeFileSync(join(repo,'scripts/run_scheduled_paper.mjs'),[
  "import fs from 'node:fs';",
  "const path='frontend/public/cloud-paper.json';",
  "const old=JSON.parse(fs.readFileSync(path,'utf8'));",
  "if(old.realOrdersEnabled!==false||old.actualCapitalINR!==0)throw Error('unsafe seed');",
  "old.runCount++;",
  "fs.appendFileSync(process.env.ATLAS_RUN_LOG,'checked\\n');",
  "fs.writeFileSync(path,JSON.stringify(old)+'\\n');"
 ].join('\n'));
 git(repo,'add','.');
 git(repo,'commit','-m','fixture: safe paper seed');
 git(repo,'push','-u','origin','HEAD:main');
 git(root,'clone',remote,actor);
 git(actor,'config','user.name','race-test');
 git(actor,'config','user.email','race-test@example.test');
 const bin=join(root,'bin');mkdirSync(bin);
 const fakeGit=join(bin,'git');
 writeFileSync(fakeGit,[
  '#!/usr/bin/env bash',
  'if [[ "${1:-}" == "push" && "${ATLAS_RACE_FAIL_PUBLISH:-}" == "1" ]]; then exit 1; fi',
  'if [[ "${1:-}" == "push" && "${ATLAS_RACE_INJECT:-}" == "1" && ! -e "$ATLAS_RACE_MARKER" ]]; then',
  '  printf "raced" > "$ATLAS_RACE_MARKER"',
  '  printf "preserve unrelated commit\\n" > "$ATLAS_RACE_ACTOR/race.txt"',
  '  "$ATLAS_REAL_GIT" -C "$ATLAS_RACE_ACTOR" add race.txt',
  '  "$ATLAS_REAL_GIT" -C "$ATLAS_RACE_ACTOR" commit -m "fixture: another maintainer advanced main" >/dev/null',
  '  "$ATLAS_REAL_GIT" -C "$ATLAS_RACE_ACTOR" push origin HEAD:main >/dev/null 2>&1',
  'fi',
  'exec "$ATLAS_REAL_GIT" "$@"',
  ''
 ].join('\n'));
 chmodSync(fakeGit,0o755);
 const log=join(root,'checks.log'),marker=join(root,'raced.marker');
 const env={...process.env,PATH:bin+':'+process.env.PATH,
  GITHUB_ACTIONS:'true',GITHUB_WORKSPACE:repo,ATLAS_EXECUTION_MODE:'PAPER_ONLY',
  ATLAS_REAL_GIT:realGit,ATLAS_RACE_ACTOR:actor,ATLAS_RACE_MARKER:marker,
  ATLAS_RUN_LOG:log};
 return {root,remote,repo,actor,log,marker,env,dispose:()=>rmSync(root,{recursive:true,force:true})};
}
test('publication refuses an owner-machine or unauthorized run',()=>{
 const s=sandbox();
 try{
  const bad=spawnSync('bash',[publisher],{cwd:s.repo,env:{...s.env,GITHUB_ACTIONS:'false'},encoding:'utf8',timeout:12000});
  assert.equal(bad.status,2,bad.stdout+bad.stderr);
  assert.equal(existsSync(s.log),false);
  assert.equal(JSON.parse(git(s.repo,'show','HEAD:frontend/public/cloud-paper.json')).runCount,0);
 }finally{s.dispose()}
});
test('racing main update leads to fresh retry, never rebased hypothetical ledger',()=>{
 const s=sandbox();
 try{
  const run=spawnSync('bash',[publisher],{cwd:s.repo,
   env:{...s.env,ATLAS_RACE_INJECT:'1'},encoding:'utf8',timeout:25000});
  assert.equal(run.status,0,run.stdout+run.stderr);
  assert.match(run.stdout,/discarding stale candidate/);
  assert.match(run.stdout,/attempt 2/);
  assert.equal(readFileSync(s.log,'utf8').trim().split('\n').length,2);
  git(s.actor,'fetch','origin','main');
  const published=JSON.parse(git(s.actor,'show','origin/main:frontend/public/cloud-paper.json'));
  assert.equal(published.runCount,1,'only one forward attempt is persisted');
  assert.equal(published.realOrdersEnabled,false);
  assert.equal(published.actualCapitalINR,0);
  assert.equal(git(s.actor,'show','origin/main:race.txt'),'preserve unrelated commit');
 }finally{s.dispose()}
});
test('non-race publish failure stops without force push or repeated checks',()=>{
 const s=sandbox();
 try{
  const run=spawnSync('bash',[publisher],{cwd:s.repo,
   env:{...s.env,ATLAS_RACE_FAIL_PUBLISH:'1'},encoding:'utf8',timeout:15000});
  assert.equal(run.status,1,run.stdout+run.stderr);
  assert.match(run.stdout,/without an upstream race/);
  assert.equal(readFileSync(s.log,'utf8').trim().split('\n').length,1);
  git(s.actor,'fetch','origin','main');
  const published=JSON.parse(git(s.actor,'show','origin/main:frontend/public/cloud-paper.json'));
  assert.equal(published.runCount,0);
 }finally{s.dispose()}
});
