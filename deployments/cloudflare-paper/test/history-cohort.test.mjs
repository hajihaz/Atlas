import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {archiveHistoryCohort,archiveScheduledCohortStep,cohortSpec,readHistoryCohort} from '../src/upstox-history-cohort.js';

const schema=readFileSync(new URL('../history-pilot.sql',import.meta.url),'utf8');
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(schema);
 const db={prepare(query){return {bind(...params){return {
  async first(){return sql.prepare(query).get(...params)||null},
  async run(){const x=sql.prepare(query).run(...params);return {meta:{changes:x.changes}}},
  async all(){return {results:sql.prepare(query).all(...params)}},
 }}}}};
 return {sql,env:{HISTORY_DB:db,UPSTOX_ANALYTICS_TOKEN:'T'.repeat(120)}};
}
const payload=day=>({status:'success',data:{candles:[
 [`${day}T09:16:00+05:30`,100,102,99,101,5000,0],
 [`${day}T09:15:00+05:30`,99,100,98,100,4000,0],
]}});

test('cohort is limited to ten dated premarket identities',()=>{
 assert.equal(cohortSpec({source_date:'2026-10-28',symbol:'RELIANCE'}).key,'NSE_EQ|INE002A01018');
 assert.equal(cohortSpec({source_date:'2026-09-24',symbol:'RELIANCE'}).roster,null);
 assert.throws(()=>cohortSpec({source_date:'2026-09-23',symbol:'RELIANCE'}),/invalid dated cohort/);
 assert.throws(()=>cohortSpec({source_date:'2026-10-28',symbol:'OTHER'}),/invalid dated cohort/);
 assert.throws(()=>cohortSpec({source_date:'2026-10-28',symbol:'__proto__'}),/invalid dated cohort/);
});

test('cohort records source body, roster provenance and immutable replay',async()=>{
 const f=fixture(),input={source_date:'2026-10-28',symbol:'RELIANCE'};let calls=0;
 const fetcher=async(url,options)=>{
  calls++;assert.match(url,/NSE_EQ%7CINE002A01018\/minutes\/1\/2026-10-28\/2026-10-28/);
  assert.equal(options.headers.Authorization,'Bearer '+'T'.repeat(120));
  return new Response(JSON.stringify(payload(input.source_date)),{status:200,headers:{'content-type':'application/json'}});
 };
 const first=await archiveHistoryCohort(f.env,input,fetcher,()=>Date.parse('2026-10-30T03:00:00Z'));
 assert.equal(first.status,'CAPTURED');assert.equal(first.candle_count,2);assert.equal(calls,1);
 assert.match(first.evidence_class,/PREMARKET_ROSTER_SHA256=/);
 const second=await archiveHistoryCohort(f.env,input,async()=>{throw Error('must not refetch')});
 assert.equal(second.status,'VERIFIED_EXISTING');
 const listing=await readHistoryCohort(f.env);
 assert.equal(listing.expected_symbol_days,30);assert.equal(listing.archived_symbol_days,1);
 f.sql.prepare("UPDATE history_samples SET response_body='tampered'").run();
 await assert.rejects(archiveHistoryCohort(f.env,input,async()=>{throw Error('must not refetch')}),/integrity mismatch/);
});

test('post-session cloud Cron archives one fixed watchlist symbol with an honest roster label',async()=>{
 const f=fixture(),scheduled=Date.parse('2026-11-02T11:00:00Z');
 const fetcher=async(url)=>{
  assert.match(url,/historical-candle\/intraday\/NSE_EQ%7CINE238A01034\/minutes\/1$/);
  return new Response(JSON.stringify(payload('2026-11-02')),{status:200,headers:{'content-type':'application/json'}});
 };
 await assert.rejects(archiveScheduledCohortStep(f.env,scheduled,fetcher,()=>Date.parse('2026-11-02T09:00:00Z')),/session not complete/);
 const result=await archiveScheduledCohortStep(f.env,scheduled,fetcher,()=>Date.parse('2026-11-02T11:01:00Z'));
 assert.equal(result.symbol,'AXISBANK');
 assert.match(result.evidence_class,/FIXED_WATCHLIST_IDENTITY_ONLY_NO_DATED_ROSTER/);
 const replay=await archiveScheduledCohortStep(f.env,scheduled,async()=>{throw Error('must not refetch')},()=>Date.parse('2026-11-02T13:01:00Z'));
 assert.equal(replay.status,'VERIFIED_EXISTING');
 const dated=await readHistoryCohort(f.env,'2026-11-02');
 assert.equal(dated.expected_symbol_days,10);
 assert.equal(dated.archived_symbol_days,1);
 assert.equal(dated.source_date,'2026-11-02');
 assert.equal(dated.roster_sha256,null);
 assert.equal(dated.samples[0].instrument_key,'NSE_EQ|INE238A01034');
 const missing=await readHistoryCohort(f.env,'2026-11-03');
 assert.equal(missing.archived_symbol_days,0);
 await assert.rejects(readHistoryCohort(f.env,'2026-11-02x'),/invalid cohort date/);
 await assert.rejects(archiveScheduledCohortStep(f.env,Date.parse('2026-11-02T12:00:00Z'),fetcher),/invalid scheduled slot/);
});

test('current-day intraday receipt remains verifiable after it becomes historical',async()=>{
 const f=fixture(),input={source_date:'2026-10-30',symbol:'NHPC'};
 const first=await archiveHistoryCohort(f.env,input,async(url)=>{
  assert.match(url,/historical-candle\/intraday\/NSE_EQ%7CINE848E01016\/minutes\/1$/);
  return new Response(JSON.stringify(payload('2026-10-30')),{status:200,headers:{'content-type':'application/json'}});
 },()=>Date.parse('2026-10-30T11:01:00Z'));
 assert.equal(first.status,'CAPTURED');
 assert.match(first.evidence_class,/^INTRADAY_PROVIDER_RETRIEVAL_AFTER_SESSION/);
 const replay=await archiveHistoryCohort(f.env,input,async()=>{throw Error('must not refetch')},
  ()=>Date.parse('2026-10-31T11:01:00Z'));
 assert.equal(replay.status,'VERIFIED_EXISTING');
 assert.equal(replay.body_sha256,first.body_sha256);
});

test('cohort refuses mismatched day, invalid candle and absent read-only credential',async()=>{
 const f=fixture(),input={source_date:'2026-10-29',symbol:'NHPC'};
 await assert.rejects(archiveHistoryCohort({...f.env,UPSTOX_ANALYTICS_TOKEN:''},input,async()=>{throw Error('must not fetch')}),/unavailable/);
 await assert.rejects(archiveHistoryCohort(f.env,input,async()=>new Response(JSON.stringify(payload('2026-10-28')),{status:200,headers:{'content-type':'application/json'}})),/invalid dated/);
 const bad=payload(input.source_date);bad.data.candles[0][5]=-1;
 await assert.rejects(archiveHistoryCohort(f.env,input,async()=>new Response(JSON.stringify(bad),{status:200,headers:{'content-type':'application/json'}})),/invalid OHLCV/);
});
