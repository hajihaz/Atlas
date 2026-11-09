import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLocalApiServer} from '../server.js';
import {NsePaperStore} from '../../scripts/nse_paper_store.mjs';
import {validateNsePaperReport} from '../src/lib/nsePaperReport.js';
import {NOW,START,universe,input,refresh} from './nse-pilot-fixture.mjs';

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-nse-view-'));
  const folder=path.join(root,'.atlas-runtime');await fs.mkdir(folder,{mode:0o700});
  const store=new NsePaperStore(path.join(folder,'nse-paper.sqlite3'),{universe,startedAt:Date.now()-1000});
  const report=store.report(Date.now());store.close();
  const file=path.join(folder,'nse-paper.json');
  await fs.writeFile(file,JSON.stringify(report),{mode:0o600});
  const server=createLocalApiServer({readOnly:true,ownerRoot:root});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});
  return{root,folder,file,report,base:'http://127.0.0.1:'+server.address().port};
}
test('private report projects only reconciled virtual balances and strips unrelated fields',async t=>{
  const {report}=await fixture(t);
  report.extra='REDACT_ME';report.sessions[0].apiCredential='REDACT_ME';
  const accepted=validateNsePaperReport(report);
  assert.equal(JSON.stringify(accepted).includes('REDACT_ME'),false);
  assert.equal(accepted.sessions.length,5);assert.equal(accepted.sessions[0].cashINR,100000);
  assert.equal(accepted.realOrdersEnabled,false);assert.equal(accepted.actualCapitalINR,0);
});
test('report validation rejects forged capital, arithmetic, real orders and stale forward state',async t=>{
  const {report}=await fixture(t);
  const mutations=[
    r=>r.realOrdersEnabled=true,r=>r.actualCapitalINR=100000,
    r=>r.sessions[0].cashINR=99999,r=>r.sessions[0].netPnlINR=50,
    r=>r.observedAt=new Date(Date.now()-91000).toISOString(),r=>r.qualified=true,
    r=>r.mode='HISTORICAL_REPLAY',
  ];
  for(const mutate of mutations){const value=structuredClone(report);mutate(value);assert.throws(()=>validateNsePaperReport(value));}
});
test('immutable historical results retain generation time without masquerading as fresh forward data',async t=>{
  const {report}=await fixture(t);report.mode='HISTORICAL_REPLAY';
  report.observedAt='2026-10-01T10:00:00Z';
  assert.equal(validateNsePaperReport(report,Date.now(),'HISTORICAL_REPLAY').mode,'HISTORICAL_REPLAY');
  assert.throws(()=>validateNsePaperReport(report));
});
test('owner API serves guarded GET and read-only strategy/day accounting through the same CLI',async t=>{
  const {base}=await fixture(t);
  const response=await fetch(base+'/api/nse-paper');
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'),null);
  const value=await response.json();assert.equal(value.sessions.length,5);
  const day=await fetch(base+'/api/nse-paper?strategy=sma_9_21&date=2026-10-26&offset=0');
  assert.equal(day.status,200);assert.deepEqual((await day.json()).events,[]);
  assert.equal((await fetch(base+'/api/nse-paper',{method:'POST',body:'{}'})).status,405);
  assert.equal((await fetch(base+'/api/nse-paper',{headers:{Origin:'https://example.org'}})).status,403);
});
test('owner report query rejects traversal, invalid dates, unknown strategies and duplicate parameters',async t=>{
  const {base}=await fixture(t);
  for(const query of ['?mode=other','?strategy=evil&date=2026-10-26',
    '?strategy=sma_9_21&date=2026-02-31','?strategy=sma_9_21&date=../../etc',
    '?offset=1','?mode=forward&mode=historical','?mode=forward&file=/etc/passwd']){
    assert.equal((await fetch(base+'/api/nse-paper'+query)).status,400,query);
  }
});
test('owner API fails closed on public permissions, symlinks and a forged report mode',async t=>{
  const {base,file,folder,report}=await fixture(t);
  await fs.chmod(file,0o644);assert.equal((await fetch(base+'/api/nse-paper')).status,503);
  await fs.chmod(file,0o600);await fs.rename(file,file+'.original');await fs.symlink(file+'.original',file);
  assert.equal((await fetch(base+'/api/nse-paper')).status,503);await fs.unlink(file);
  await fs.writeFile(file,JSON.stringify({...report,mode:'SYNTHETIC_QA'}),{mode:0o600});
  assert.equal((await fetch(base+'/api/nse-paper')).status,503);
  await fs.writeFile(file,JSON.stringify(report));await fs.chmod(folder,0o755);
  assert.equal((await fetch(base+'/api/nse-paper')).status,503);
});

test('historical fills survive the API projection and browser validation with reconciled cash evidence',async t=>{
  const {base,folder}=await fixture(t);
  const store=new NsePaperStore(path.join(folder,'history.sqlite3'),{universe,startedAt:START,mode:'HISTORICAL_REPLAY'});
  const first=input(NOW,{mode:'HISTORICAL_CANDLE_SIMULATION'});
  store.advance(first,NOW);store.advance(refresh(first,NOW+2000),NOW+2000);
  const report=store.report(Date.now());store.close();
  assert.ok(report.events.some(e=>e.type==='FILL'));
  await fs.writeFile(path.join(folder,'nse-history-report.json'),JSON.stringify(report),{mode:0o600});
  const response=await fetch(base+'/api/nse-paper?mode=historical');
  assert.equal(response.status,200);
  const accepted=await response.json();
  assert.deepEqual(validateNsePaperReport(accepted,Date.now(),'HISTORICAL_REPLAY'),accepted);
  assert.ok(accepted.events.filter(e=>e.type==='FILL').every(e=>Number.isSafeInteger(e.cashAfterPaise)));
});

test('validation mode reads separate private files without replacing original historical results',async t=>{
 const {base,folder,report}=await fixture(t);
 const historical={...report,mode:'HISTORICAL_REPLAY',note:'BASELINE_RETAINED'};
 const validation={...report,mode:'HISTORICAL_REPLAY',note:'Separate temporal validation'};
 const historicalFile=path.join(folder,'nse-history-report.json');
 await fs.writeFile(historicalFile,JSON.stringify(historical),{mode:0o600});
 await fs.writeFile(path.join(folder,'nse-validation-report.json'),JSON.stringify(validation),{mode:0o600});
 const days=path.join(folder,'nse-validation-days');await fs.mkdir(days,{mode:0o700});
 await fs.writeFile(path.join(days,'sma_9_21_2026-10-26_0.json'),JSON.stringify(validation),{mode:0o600});
 const response=await fetch(base+'/api/nse-paper?mode=validation');
 assert.equal(response.status,200);
 const accepted=validateNsePaperReport(await response.json(),Date.now(),'HISTORICAL_REPLAY');
 assert.equal(accepted.note,'Separate temporal validation');
 const day=await fetch(base+'/api/nse-paper?mode=validation&strategy=sma_9_21&date=2026-10-26');
 assert.equal(day.status,200);assert.equal((await day.json()).note,'Separate temporal validation');
 assert.equal(await fs.readFile(historicalFile,'utf8'),JSON.stringify(historical));
 const forward=await fetch(base+'/api/nse-paper?mode=forward');assert.equal((await forward.json()).mode,'FORWARD');
});
