import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyMisSourceReachability} from '../src/upstox-feed.js';

test('owner MIS probe compares exact public GET profiles without exposing a body or credential',async()=>{
 const seen=[];
 const fetcher=async(url,options)=>{
  seen.push({url,options});
  return new Response('blocked',{status:403,headers:{'content-type':'text/html','last-modified':'Thu, 29 Oct 2026 02:00:05 GMT'}});
 };
 const plain=await verifyMisSourceReachability('plain',fetcher);
 const identified=await verifyMisSourceReachability('identified',fetcher);
 assert.equal(plain.http_status,403);
 assert.equal(plain.last_modified,'Thu, 29 Oct 2026 02:00:05 GMT');
 assert.ok(!JSON.stringify(plain).includes('blocked'));
 assert.equal(seen[0].options.method,'GET');
 assert.equal(seen[0].options.redirect,'manual');
 assert.equal(seen[0].options.headers,undefined);
 assert.equal(seen[1].options.headers['User-Agent'],'AtlasPrivateResearch/1.0');
 assert.equal(identified.profile,'identified');
 await assert.rejects(verifyMisSourceReachability('other',async()=>{throw Error('must not fetch')}),/invalid MIS probe/);
});
