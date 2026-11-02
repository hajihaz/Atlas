import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {archiveNseReference,nseReferenceSpec,scheduledNseReferenceStep,verifyNseReference} from '../src/nse-reference-archive.js';

function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('../nse-reference.sql',import.meta.url),'utf8'));
 const db={prepare(query){return {bind(...params){return {
  async first(){return sql.prepare(query).get(...params)||null},
  async run(){const x=sql.prepare(query).run(...params);return {meta:{changes:x.changes}}},
 }}}}};
 const blobs=new Map(),kv={
  async get(key){const v=blobs.get(key);return v?Uint8Array.from(v).buffer:null},
  async put(key,value){blobs.set(key,Uint8Array.from(value))},
 };
 return {sql,blobs,env:{HISTORY_DB:db,NSE_REFERENCE_ARCHIVE:kv}};
}
const eod=Uint8Array.from([0x50,0x4b,0x03,0x04,...Array(150).fill(7)]);
const master=Uint8Array.from([0x1f,0x8b,...Array(150).fill(8)]);
const now=()=>Date.parse('2026-10-30T02:01:00Z');
const response=(bytes,modified='Thu, 29 Oct 2026 17:57:02 GMT')=>
 new Response(bytes,{status:200,headers:{'content-type':'application/octet-stream','last-modified':modified}});

test('exact official dated source names and strict inputs',()=>{
 assert.match(nseReferenceSpec('2026-10-29','eod').url,/BhavCopy_NSE_CM_0_0_0_20261029_F_0000.csv.zip$/);
 assert.match(nseReferenceSpec('2026-10-29','master').url,/NSE_CM_security_29102026.csv.gz$/);
 assert.throws(()=>nseReferenceSpec('2026-02-30','eod'),/invalid source date/);
 assert.throws(()=>nseReferenceSpec('2026-10-29','other'),/invalid source kind/);
});

test('private raw reference receipt is immutable and verified from KV',async()=>{
 const f=fixture();let calls=0;
 const input={day:'2026-10-29',kind:'eod'};
 const first=await archiveNseReference(f.env,input,async(url,options)=>{
  calls++;assert.equal(url,nseReferenceSpec(input.day,input.kind).url);
  assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');
  return response(eod);
 },now);
 assert.equal(first.status,'CAPTURED');assert.equal(first.integrity_verified,true);
 assert.equal(first.body_bytes,eod.length);assert.equal(first.raw_body_exposed,false);
 assert.equal(f.blobs.size,1);
 const second=await archiveNseReference(f.env,input,async()=>{throw Error('must not refetch')},now);
 assert.equal(second.status,'VERIFIED_EXISTING');assert.equal(calls,1);
 const summary=await verifyNseReference(f.env,input.day,input.kind);
 assert.equal(summary.body_sha256,first.body_sha256);
 assert.equal((await verifyNseReference(f.env,'2026-10-28','eod')).status,'MISSING');
 const key=[...f.blobs.keys()][0];f.blobs.get(key)[5]=99;
 await assert.rejects(verifyNseReference(f.env,input.day,input.kind),/stored body integrity mismatch/);
});

test('scheduled morning slots target prior seven weekdays and never invent a holiday receipt',async()=>{
 const f=fixture();let calls=0;
 const res=await scheduledNseReferenceStep(f.env,Date.parse('2026-11-02T02:02:00Z'),async(url)=>{
  calls++;assert.match(url,/20261030_F_0000.csv.zip$/);return response(eod,'Fri, 30 Oct 2026 11:03:02 GMT');
 },()=>Date.parse('2026-11-02T02:03:00Z'));
 assert.equal(res.status,'CAPTURED');assert.equal(res.source_date,'2026-10-30');
 assert.equal(calls,1);
 const weekend=await scheduledNseReferenceStep(f.env,Date.parse('2026-11-02T02:00:00Z'),async()=>{throw Error('no request')});
 assert.equal(weekend.status,'CLOSED_WEEKEND_SKIPPED');
 await assert.rejects(scheduledNseReferenceStep(f.env,Date.parse('2026-11-02T04:00:00Z')),/invalid reference slot/);
});

test('stale, missing and malformed source evidence fails without a manifest',async()=>{
 const f=fixture(),input={day:'2026-10-29',kind:'master'};
 await assert.rejects(archiveNseReference(f.env,input,async()=>response(master),()=>Date.parse('2026-10-29T18:00:00Z')),/source date not complete/);
 await assert.rejects(archiveNseReference(f.env,input,async()=>new Response('',{status:404}),now),/source HTTP 404/);
 await assert.rejects(archiveNseReference(f.env,input,async()=>response(eod),now),/source body or format invalid/);
 await assert.rejects(archiveNseReference(f.env,input,async()=>response(master,'Sat, 31 Oct 2026 17:57:02 GMT'),now),/publication time invalid/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM nse_reference_receipts').get().n,0);
});
