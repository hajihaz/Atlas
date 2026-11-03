import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {archiveEtfDaily,readEtfDaily} from '../src/etf-daily-archive.js';
const DAY='2026-11-02',NOW=Date.parse('2026-11-03T19:00:00Z');
const db=sqlite=>({prepare(sql){return {bind(...params){return {
 async first(){return sqlite.prepare(sql).get(...params)||null},
 async run(){const r=sqlite.prepare(sql).run(...params);return {meta:{changes:r.changes}}}
}}}}});
const candles=Array.from({length:201},(_,i)=>{
 const date=new Date(Date.parse(DAY+'T00:00:00Z')-(200-i)*86400000).toISOString().slice(0,10);
 return [date+'T00:00:00+05:30',100,101,99,100,1000,0];
});
test('private ETF archive stores exact historical and action bytes but makes no adjusted claim',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../etf-daily-history.sql',import.meta.url),'utf8'));
 const env={HISTORY_DB:db(sqlite),UPSTOX_ANALYTICS_TOKEN:'x'.repeat(120)};
 let calls=0;
 const fetcher=async(url,opts)=>{calls++;assert.equal(opts.method,'GET');
  return new Response(JSON.stringify(url.includes('corporate-actions')?{status:'success',data:[]}:
   {status:'success',data:{candles}}),{status:200,headers:{'content-type':'application/json'}});
 };
 const input={day:DAY,symbol:'NIFTYBEES'};
 const saved=await archiveEtfDaily(env,input,fetcher,()=>NOW);
 assert.equal(saved.status,'CAPTURED');assert.equal(saved.candleCount,201);
 assert.equal(saved.adjusted,false);assert.equal(calls,2);
 assert.equal((await readEtfDaily(env,DAY,'NIFTYBEES')).status,'VERIFIED_EXISTING');
 assert.equal((await archiveEtfDaily(env,input,fetcher,()=>NOW)).status,'VERIFIED_EXISTING');
 assert.equal(calls,2);
 sqlite.prepare("UPDATE etf_daily_receipts SET historical_body='changed' WHERE source_day=? AND symbol=?").run(DAY,'NIFTYBEES');
 await assert.rejects(readEtfDaily(env,DAY,'NIFTYBEES'),/stored ETF receipt changed/);
});
test('incomplete latest session cannot be disguised as ready history',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../etf-daily-history.sql',import.meta.url),'utf8'));
 const env={HISTORY_DB:db(sqlite),UPSTOX_ANALYTICS_TOKEN:'x'.repeat(120)};
 const fetcher=async()=>new Response(JSON.stringify({status:'success',data:{candles:candles.slice(0,-1)}}),{status:200});
 await assert.rejects(archiveEtfDaily(env,{day:DAY,symbol:'GOLDBEES'},fetcher,()=>NOW),/provider historical daily session missing/);
});
