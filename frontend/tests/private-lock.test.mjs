import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {withPrivateLock} from '../private-lock.js';
import {createPushStore} from '../local-push.js';

async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'atlas-lease-test-'));
 return {dir,cleanup:()=>rm(dir,{recursive:true,force:true})};
}
async function orphan(dir,pid){
 const lock=join(dir,'operation.lock'),name='owner-'+randomBytes(18).toString('hex')+'.json';
 await mkdir(lock,{mode:0o700});
 const value=JSON.stringify({pid,at:Date.now()-60000});
 await writeFile(join(lock,name),value,{mode:0o600});
 return {lock,name,value};
}

test('concurrent orphan recovery cannot return a VAPID key different from the stored key',async()=>{
 const dead=spawnSync(process.execPath,['-e','process.exit(0)']).pid;
 assert.throws(()=>process.kill(dead,0),e=>e.code==='ESRCH');
 for(let round=0;round<12;round++){
  const f=await fixture();
  try{
   await orphan(f.dir,dead);
   const store=createPushStore(f.dir);
   const results=await Promise.allSettled(Array.from({length:24},()=>store.config()));
   const returned=results.filter(r=>r.status==='fulfilled').map(r=>r.value.publicKey);
   const stored=JSON.parse(await readFile(join(f.dir,'keys.json'),'utf8'));
   assert.ok(returned.length>=1);
   assert.equal(new Set(returned).size,1);
   assert.ok(returned.every(key=>key===stored.publicKey));
   assert.deepEqual((await readdir(f.dir)).sort(),['keys.json']);
  }finally{await f.cleanup();}
 }
});

test('an old live-process lease is never stolen',async()=>{
 const f=await fixture();
 try{
  const old=await orphan(f.dir,process.pid);
  let called=false;
  await assert.rejects(withPrivateLock(f.dir,async()=>{called=true;}),/already active/);
  assert.equal(called,false);
  assert.equal(await readFile(join(old.lock,old.name),'utf8'),old.value);
 }finally{await f.cleanup();}
});

test('an action failure releases only its own lease and permits a subsequent operation',async()=>{
 const f=await fixture();
 try{
  await assert.rejects(withPrivateLock(f.dir,async()=>{throw Error('fixture action failed')}),/fixture action failed/);
  assert.deepEqual(await readdir(f.dir),[]);
  const value=await withPrivateLock(f.dir,async()=>42);
  assert.equal(value,42);
  assert.deepEqual(await readdir(f.dir),[]);
 }finally{await f.cleanup();}
});

test('legacy file locks require controlled migration and are never blindly removed',async()=>{
 const f=await fixture();
 try{
  const path=join(f.dir,'operation.lock'),value=JSON.stringify({pid:2147483647,at:Date.now()-60000});
  await writeFile(path,value);
  await assert.rejects(createPushStore(f.dir).config(),/controlled migration/);
  assert.equal(await readFile(path,'utf8'),value);
  assert.deepEqual(await readdir(f.dir),['operation.lock']);
 }finally{await f.cleanup();}
});

test('a symlink lease cannot redirect orphan recovery outside the private store',async()=>{
 const f=await fixture(),outside=await fixture();
 try{
  await writeFile(join(outside.dir,'sentinel'),'keep');
  await symlink(outside.dir,join(f.dir,'operation.lock'));
  await assert.rejects(createPushStore(f.dir).config(),/controlled migration/);
  assert.equal(await readFile(join(outside.dir,'sentinel'),'utf8'),'keep');
  assert.deepEqual(await readdir(outside.dir),['sentinel']);
 }finally{await f.cleanup();await outside.cleanup();}
});

test('contending actions never overlap during normal acquisition and release',async()=>{
 const f=await fixture();let active=0,max=0,completed=0;
 try{
  for(let round=0;round<8;round++){
   await Promise.allSettled(Array.from({length:20},()=>withPrivateLock(f.dir,async()=>{
    active++;max=Math.max(max,active);
    await new Promise(resolve=>setTimeout(resolve,5));
    completed++;active--;
   })));
  }
  assert.ok(completed>=8);
  assert.equal(max,1);
  assert.equal(active,0);
  assert.deepEqual(await readdir(f.dir),[]);
 }finally{await f.cleanup();}
});
