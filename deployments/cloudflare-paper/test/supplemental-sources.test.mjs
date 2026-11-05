import test from 'node:test';
import assert from 'node:assert/strict';
import {probeSupplemental} from '../src/supplemental-sources.js';
const now=Date.parse('2026-11-06T04:30:00Z'),env={UPSTOX_ANALYTICS_TOKEN:'x'.repeat(120)};
test('GIFT rolling-index access never masquerades as same-contract evidence',async()=>{
 const result=await probeSupplemental(env,'gift','2026-11-06',{clock:()=>now,fetcher:async(url,options)=>{
  assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.equal(new URL(url).origin,'https://api.upstox.com');
  assert.equal(new URL(url).searchParams.get('instrument_key'),'GLOBAL_INDEX|SGX NIFTY');
  return new Response(JSON.stringify({status:'success',data:{'GLOBAL_INDEX:SGX NIFTY':{instrument_token:'GLOBAL_INDEX|SGX NIFTY',last_price:24000,timestamp:new Date(now).toISOString()}}}));
 }});
 assert.equal(result.sameContractCertified,false);assert.equal(result.forwardQualified,false);assert.equal(result.declaredLatencySeconds,120);
 assert.equal(result.sourceSha256.length,64);assert.equal(JSON.stringify(result).includes(env.UPSTOX_ANALYTICS_TOKEN),false);
});
test('unknown source kinds, old dates, absent credential and redirects fail before qualification',async()=>{
 let calls=0;const options={clock:()=>now,fetcher:async()=>{calls++;return new Response('{}',{status:302});}};
 await assert.rejects(()=>probeSupplemental(env,'orders','2026-11-06',options),/source kind/);
 await assert.rejects(()=>probeSupplemental(env,'gift','2026-11-05',options),/current date/);
 await assert.rejects(()=>probeSupplemental({},'gift','2026-11-06',options),/credential/);
 assert.equal(calls,0);
 await assert.rejects(()=>probeSupplemental(env,'gift','2026-11-06',options),/HTTP/);
});
test('supplemental probe is owner-only GET; no anonymous source requests or public writes',async()=>{
 const {default:worker}=await import('../src/index.js');const config={DB:{},OWNER_TOKEN:'z'.repeat(40)};
 assert.equal((await worker.fetch(new Request('https://atlas.invalid/api/cloud-paper/supplemental-source?kind=gift'),config)).status,401);
 assert.equal((await worker.fetch(new Request('https://atlas.invalid/api/cloud-paper/supplemental-source',{method:'POST'}),config)).status,405);
});
