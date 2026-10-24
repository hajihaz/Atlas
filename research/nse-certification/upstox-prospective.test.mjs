import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,symlink,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {INSTRUMENT_FILES,historicalCandleUrl,prospectiveCapturePlan,capturePreopenFiles} from './upstox-prospective.mjs';

// Engineering fixtures only: no market observations, permissions or account are represented.
const session='2026-10-26',at=Date.parse('2026-10-26T08:00:00+05:30');
const fakeBytes=gzipSync(JSON.stringify([{instrument_key:'NSE_EQ|INE848E01016'}]));
function response(url,{bytes=fakeBytes,length=null,onRead=()=>{},onCancel=()=>{},chunks=null}={}){
  let index=0;
  const values=chunks??[bytes];
  return {ok:true,status:200,url,headers:{get:name=>name==='last-modified'?'Mon, 26 Oct 2026 01:00:00 GMT':name==='content-length'?length:null},
    body:{getReader:()=>({read:async()=>{if(index>=values.length)return {done:true};onRead(index);return {done:false,value:values[index++]};},
      cancel:async()=>onCancel(),releaseLock(){}})}};
}
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'atlas-upstox-fixture-'));
 t.after(()=>rm(root,{recursive:true,force:true}));return root;
}
test('plan/route never request data or relabel historic membership',()=>{
 const plan=prospectiveCapturePlan(session,at);assert.equal(plan.requestsSent,0);assert.equal(plan.certifiedHistoricalSessions,0);
 assert.equal(plan.captureStatus,'OWNER_APPROVAL_PENDING');assert.equal(Object.keys(INSTRUMENT_FILES).length,3);
 assert.match(historicalCandleUrl({instrumentKey:'NSE_EQ|INE848E01016',fromDate:'2026-10-01',toDate:'2026-10-26'}),/NSE_EQ%7CINE848E01016/);
 for(const data of [{instrumentKey:'../v2/order/place',fromDate:session,toDate:session},
   {instrumentKey:'NSE_EQ|INE848E01016',fromDate:'2026-09-01',toDate:session}])assert.throws(()=>historicalCandleUrl(data));
});
test('approval/date/weekday gates refuse before any network call',async t=>{
 const root=await fixture(t);let calls=0;const args={session,now:()=>at,root,fetcher:async u=>{calls++;return response(u);}};
 await assert.rejects(capturePreopenFiles(args),/approval/i);
 for(const extra of [{session:'2026-09-18'},{now:()=>Date.parse('2026-10-26T09:15:00+05:30')},
  {session:'2026-10-24',now:()=>Date.parse('2026-10-24T08:00:00+05:30')}])
  await assert.rejects(capturePreopenFiles({...args,approved:true,...extra}));
 assert.equal(calls,0);
});
test('mocked capture preserves private exact bytes, source dates and unverified flags',async t=>{
 const root=await fixture(t),calls=[];
 const manifest=await capturePreopenFiles({session,root,now:()=>at,approved:true,
  fetcher:async(url,options)=>{calls.push({url,options});return response(url,{length:String(fakeBytes.length)});}});
 assert.equal(calls.length,3);assert(calls.every(c=>c.options.method==='GET'&&c.options.redirect==='error'&&!c.options.headers.authorization));
 assert.equal(manifest.certifiedHistoricalSessions,0);assert.equal(manifest.fullUniverseVerified,false);
 assert.equal(manifest.rightsIndependentlyVerified,false);
 for(const file of manifest.files){assert.deepEqual(await readFile(join(root,session,file.path)),fakeBytes);assert.match(file.sha256,/^[a-f0-9]{64}$/);}
 await assert.rejects(capturePreopenFiles({session,root,now:()=>at,approved:true,fetcher:async()=>{calls.push('bad');}}),/already exists/);
 assert.equal(calls.length,3);
});
test('receipt time follows complete body download rather than headers',async t=>{
 const root=await fixture(t);let clock=at;
 const manifest=await capturePreopenFiles({session,root,now:()=>clock,approved:true,
  fetcher:async url=>response(url,{onRead:()=>{clock+=1000;}})});
 assert.equal(manifest.files[0].requestedAt,new Date(at).toISOString());
 assert.equal(manifest.files[0].receivedAt,new Date(at+1000).toISOString());
 assert.equal(manifest.files[2].receivedAt,new Date(at+3000).toISOString());
});
test('late body and backward clock cannot become preopen evidence',async t=>{
 for(const mode of ['late','backward']){
  const root=await fixture(t);let clock=mode==='late'?Date.parse(session+'T09:14:59+05:30'):at;
  await assert.rejects(capturePreopenFiles({session,root,now:()=>clock,approved:true,
   fetcher:async url=>response(url,{onRead:()=>{clock+=mode==='late'?2000:-1000;}})}),mode==='late'?/pre-open/:/backward/);
  await assert.rejects(access(join(root,session,'receipt.json')));
 }
});
test('unbounded body is cancelled at the real compressed-byte limit',async t=>{
 const root=await fixture(t);let cancelled=false;
 const chunk=new Uint8Array(1024*1024),chunks=Array(33).fill(chunk);
 await assert.rejects(capturePreopenFiles({session,root,now:()=>at,approved:true,
  fetcher:async url=>response(url,{chunks,onCancel:()=>{cancelled=true;}})}),/too large/);
 assert.equal(cancelled,true);await assert.rejects(access(join(root,session,'receipt.json')));
});
test('bad length/redirect/status fail without interpreting body',async t=>{
 for(const mode of ['length','redirect','status']){
  const root=await fixture(t);let reads=0;
  await assert.rejects(capturePreopenFiles({session,root,now:()=>at,approved:true,fetcher:async url=>{
   const r=response(url,{length:mode==='length'?String(33*1024*1024):null,onRead:()=>{reads++;}});
   if(mode==='redirect')r.url='https://example.invalid';if(mode==='status')r.ok=false;return r;
  }}));
  assert.equal(reads,0);
 }
});
test('symlink destination is rejected before requests, with no overwrite',async t=>{
 const parent=await fixture(t),real=join(parent,'real'),link=join(parent,'link');
 const {mkdir}=await import('node:fs/promises');await mkdir(real);await symlink(real,link);let calls=0;
 await assert.rejects(capturePreopenFiles({session,root:link,now:()=>at,approved:true,
  fetcher:async u=>{calls++;return response(u);}}),/symlink/);
 assert.equal(calls,0);
});
test('invalid gzip or JSON cannot produce a complete receipt',async t=>{
 for(const bytes of [Buffer.from('bad'),gzipSync('{"a":1,"a":2}'),gzipSync('{}')]){
  const root=await fixture(t);
  await assert.rejects(capturePreopenFiles({session,root,now:()=>at,approved:true,fetcher:async u=>response(u,{bytes})}));
  await assert.rejects(access(join(root,session,'receipt.json')));
 }
});
