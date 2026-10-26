import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,copyFileSync,readdirSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {legacyCloudPaperFixture} from './fixtures/legacy-cloud-paper.mjs';
import {failureState} from '../../scripts/scheduled_paper_engine.mjs';
import {preparePaperCheckpointEvidence} from '../../scripts/paper_checkpoint_evidence.mjs';

// Copy only relative ESM dependencies into the temporary checkout. This lets
// --owner-output exercise the real ROOT-bound branch without touching the Mac.
function isolatedRunner(dir){
 const sourceRoot=fileURLToPath(new URL('../../',import.meta.url)),seen=new Set();
 function copy(name){
  const source=resolve(sourceRoot,name),key=relative(sourceRoot,source);
  assert.ok(!key.startsWith('..')&&/^(scripts|frontend)\//.test(key));
  if(seen.has(key))return;seen.add(key);
  const target=join(dir,key);mkdirSync(dirname(target),{recursive:true});
  copyFileSync(source,target);
  const text=readFileSync(source,'utf8');
  for(const match of text.matchAll(/(?:from\s*|import\s*)['"]([.][.\/][^'"]+)['"]/g))
   copy(relative(sourceRoot,resolve(dirname(source),match[1])));
 }
 copy('scripts/run_scheduled_paper.mjs');
 copyFileSync(join(sourceRoot,'frontend/package.json'),join(dir,'frontend/package.json'));
 return join(dir,'scripts/run_scheduled_paper.mjs');
}

// Run the actual CLI orchestration with a fully isolated source and ledger.
// Unknown fetches throw; no market, Git, production file or broker is touched.
for(const ownerOutput of [false,true])test('actual '+(ownerOutput?'owner':'hosted')+' runner preserves forward accounting and owner-only input receipts',()=>{
 const dir=mkdtempSync(join(tmpdir(),'atlas-forward-fixture-'));
 try{
  mkdirSync(join(dir,'frontend/public'),{recursive:true});
  const legacy=legacyCloudPaperFixture();
  const at=Date.parse(legacy.lastRunAt)+1000;
  const before=preparePaperCheckpointEvidence(legacy,
   failureState(legacy,'fixture rejected source',at),
   {status:'BLOCKED',code:'QUOTE_TOO_OLD',candleAgeMinutes:97}).next;
  const output=join(dir,ownerOutput?'.atlas-runtime/published/cloud-paper.json':'frontend/public/cloud-paper.json');
  mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,JSON.stringify(before));
  const loader=join(dir,'provider-fixture.mjs');
  writeFileSync(loader,`
const now=Number(process.env.ATLAS_FIXTURE_NOW);
Date.now=()=>now;
const H=3600000,end=Math.floor(now/(2*H))*2*H;
globalThis.fetch=async value=>{
 const url=new URL(String(value));
 if(url.origin!=='https://api.coindcx.com')throw Error('Unexpected fixture origin');
 if(url.pathname==='/market_data/candles'){
  const rows=Array.from({length:168},(_,i)=>{
   const time=end-168*H+i*H;
   const close=time>=Date.parse('2026-10-20T18:00:00Z')?120000:
    time>=Date.parse('2026-10-20T16:00:00Z')?110000:100000;
   return {time,open:close,high:close+10,low:close-10,close,volume:10};
  });
  return new Response(JSON.stringify(rows),{status:200});
 }
 if(url.pathname==='/exchange/ticker'){
  const price=end>=Date.parse('2026-10-20T20:00:00Z')?120000:110000;
  return new Response(JSON.stringify([{market:'BTCINR',last_price:price,
   bid:price-1,ask:price+1,timestamp:Math.floor(now/1000)-1}]),{status:200});
 }
 throw Error('Unexpected fixture URL');
};
`);
  const runner=ownerOutput?isolatedRunner(dir):fileURLToPath(new URL('../../scripts/run_scheduled_paper.mjs',import.meta.url));
  let previous=before;
  for(const [clock,status] of [['2026-10-20T18:17:00Z','GAP_SKIPPED'],
   ['2026-10-20T20:17:00Z','RUNNING']]){
   const run=spawnSync(process.execPath,['--import',loader,runner,...(ownerOutput?['--owner-output']:[])],{cwd:dir,
    encoding:'utf8',env:{...process.env,ATLAS_FIXTURE_NOW:String(Date.parse(clock)),
     GITHUB_STEP_SUMMARY:''},timeout:20000});
   assert.equal(run.status,0,run.stdout+run.stderr);
   const next=JSON.parse(readFileSync(output,'utf8'));
   assert.equal(next.status,status,run.stdout+run.stderr);
   assert.equal(next.lastSourceCheck.code,'ELIGIBLE');
   assert.equal(next.runCount,previous.runCount+1);
   assert.equal(next.recentCheckpoints.length,previous.recentCheckpoints.length+1);
   assert.deepEqual(next.recentCheckpoints.slice(0,-1),previous.recentCheckpoints);
   assert.equal(next.realOrdersEnabled,false);
   assert.equal(next.actualCapitalINR,0);
   if(status==='GAP_SKIPPED')assert.ok(next.sessions.every(s=>s.events.length===0));
   else{
    assert.ok(next.sessions.some(s=>s.events.length===1),'fixture must exercise independent fill accounting');
    assert.match(run.stdout,/Independent paper fill audit:/);
    assert.ok(next.sessions.every(s=>s.cashINR>=0));
   }
   if(ownerOutput){
    const receiptDir=join(dir,'.atlas-runtime/paper-input-receipts');
    const receipts=readdirSync(receiptDir).filter(f=>f.endsWith('.json'));
    const latest=receipts.find(f=>f.startsWith(String(Date.parse(clock))+'-'));
    assert.ok(latest,'accepted owner checkpoint must capture exact source inputs');
    const receiptPath=join(receiptDir,latest),receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
    assert.equal(receipt.candidateSnapshotSha256,createHash('sha256').update(readFileSync(output)).digest('hex'));
    assert.equal(receipt.completedBarAt,next.lastBarClosedAt);
    assert.equal(receipt.inputs.bars.at(-1).time+7200000,Date.parse(next.lastBarClosedAt));
    assert.equal(receipt.candidateOnly,true);
    assert.equal(statSync(receiptPath).mode&0o777,0o600);
    assert.equal(statSync(receiptDir).mode&0o777,0o700);
    assert.match(run.stdout,/Owner private paper input receipt:/);
   }else assert.doesNotMatch(run.stdout,/Owner private paper input receipt:/);
   previous=next;
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
