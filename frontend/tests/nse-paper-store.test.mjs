import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {NsePaperStore} from '../../scripts/nse_paper_store.mjs';
import {digest} from '../../scripts/nse_paper_engine.mjs';
import {NOW,START,universe,input,refresh} from './nse-pilot-fixture.mjs';
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-nse-ledger-'));
  fs.chmodSync(dir,0o700);t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  return{dir,file:path.join(dir,'paper.sqlite3')};
}
const create=file=>new NsePaperStore(file,{universe,startedAt:START,mode:'SYNTHETIC_QA'});

test('NSE journal reopens, independently reconciles every fill and rejects duplicate observations',t=>{
  const {file}=fixture(t);let store=create(file);
  store.advance(input(),NOW);store.advance(refresh(input(),NOW+2000),NOW+2000);
  const before=store.report(NOW+2000);store.close();
  store=new NsePaperStore(file);
  assert.deepEqual(store.report(NOW+2000),before);
  assert.equal(store.advance(refresh(input(),NOW+2000),NOW+2000).status,'DUPLICATE_INPUT');
  assert.deepEqual(store.report(NOW+2000),before);store.close();
  const readOnly=new NsePaperStore(file,{readOnly:true});
  assert.equal(readOnly.report(NOW+2000).ledgerVerified,true);
  assert.throws(()=>readOnly.advance(input(),NOW));readOnly.close();
});

test('revised previously admitted candles cannot commit fills or advance account state',t=>{
  const {file}=fixture(t),store=create(file);
  store.advance(input(),NOW);const before=store.report(NOW);
  const changed=refresh(input(),NOW+2000);
  changed.history.RELIANCE.bars[0]={...changed.history.RELIANCE.bars[0],open:101,high:101,low:101,close:101};
  assert.throws(()=>store.advance(changed,NOW+2000),/revised/);
  assert.deepEqual(store.report(NOW),before);store.close();
});

test('account tampering is caught by fill replay even when a local checksum is recomputed',t=>{
  const {file}=fixture(t),store=create(file);
  store.advance(input(),NOW);store.advance(refresh(input(),NOW+2000),NOW+2000);
  const {state,head}=store.load();state.sessions[0].cashPaise++;
  store.db.prepare('UPDATE paper_state SET state_json=?,state_hash=? WHERE singleton=1')
    .run(JSON.stringify(state),digest({state,head}));
  assert.throws(()=>store.verify(),/diverge/);store.close();
});

test('event and candle receipt edits fail independent journal checks',t=>{
  const {file}=fixture(t),store=create(file);store.advance(input(),NOW);
  store.db.prepare('UPDATE paper_bars SET payload_hash=? WHERE rowid=1').run('0'.repeat(64));
  assert.throws(()=>store.verify(),/candle/);store.close();
});

test('private journal rejects symlinks and publicly readable parent directories',t=>{
  const {file,dir}=fixture(t),outside=path.join(dir,'outside');
  fs.writeFileSync(outside,'preserve',{mode:0o600});fs.symlinkSync(outside,file);
  assert.throws(()=>create(file),/Unsafe/);
  assert.equal(fs.readFileSync(outside,'utf8'),'preserve');fs.unlinkSync(file);
  fs.chmodSync(dir,0o755);assert.throws(()=>create(file),/Private/);
});

for(const point of ['after_events','before_commit','after_commit']){
  test('actual process kill at '+point+' preserves exactly-once NSE fills',t=>{
    const {file,dir}=fixture(t);
    const store=create(file);store.advance(input(),NOW);store.close();
    const candidate=path.join(dir,'candidate.json');
    fs.writeFileSync(candidate,JSON.stringify(refresh(input(),NOW+2000)),{mode:0o600});
    const module=new URL('../../scripts/nse_paper_store.mjs',import.meta.url).href;
    const script=`import fs from 'node:fs';import {NsePaperStore} from ${JSON.stringify(module)};
      const s=new NsePaperStore(${JSON.stringify(file)});
      s.advance(JSON.parse(fs.readFileSync(${JSON.stringify(candidate)},'utf8')),${NOW+2000},
        phase=>{if(phase===${JSON.stringify(point)})process.kill(process.pid,'SIGKILL')});`;
    const killed=spawnSync(process.execPath,['--input-type=module','-e',script],{timeout:10000});
    assert.equal(killed.signal,'SIGKILL');
    const recovered=new NsePaperStore(file),before=recovered.report(NOW+2000);
    const fills=before.sessions.reduce((n,s)=>n+s.fills,0);
    assert.equal(fills>0,point==='after_commit');
    recovered.advance(refresh(input(),NOW+2000),NOW+2000);
    const once=recovered.report(NOW+2000);
    assert.ok(once.sessions.reduce((n,s)=>n+s.fills,0)>0);
    recovered.advance(refresh(input(),NOW+2000),NOW+2000);
    assert.deepEqual(recovered.report(NOW+2000),once);recovered.close();
  });
}
