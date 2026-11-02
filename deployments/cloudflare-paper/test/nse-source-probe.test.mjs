import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyNseSourceReachability} from '../src/nse-source-probe.js';

test('fixed official NSE probe reports metadata without returning the archive body',async()=>{
 let calls=0;
 const fetcher=async(url,options)=>{
  calls++;assert.match(url,/nsearchives\.nseindia\.com\/content\/cm\/NSE_CM_security_29102026\.csv\.gz$/);
  assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');
  assert.equal(options.headers['User-Agent'],'AtlasPrivateResearch/1.0');
  return new Response('private archive bytes',{status:200,headers:{'content-type':'application/gzip','content-length':'1234'}});
 };
 const result=await verifyNseSourceReachability('master',fetcher);
 assert.equal(result.http_status,200);assert.equal(result.content_length,'1234');
 assert.ok(!JSON.stringify(result).includes('private archive bytes'));assert.equal(calls,1);
 await assert.rejects(verifyNseSourceReachability('other',fetcher),/invalid NSE probe kind/);
 assert.equal(calls,1);
});
