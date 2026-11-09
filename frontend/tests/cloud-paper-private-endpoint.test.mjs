import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import handler,{getPrivateCloudSnapshot,validatePrivateCloudSnapshot}
 from '../api/cloud-paper-snapshot.js';
import {APPROVED_PREVIEW_REF} from '../api/cloud-paper-snapshot.js';

const fixture=()=>JSON.parse(readFileSync(new URL('../public/cloud-paper.json',import.meta.url),'utf8'));
const now=()=>Date.parse(fixture().lastRunAt)+20000;
const token='github_pat_read_only_atlas_Contents_read_test_only';
function responder(){
 return {headers:{},code:null,body:null,
  setHeader(k,v){this.headers[k]=v},
  status(n){this.code=n;return this},
  json(body){this.body=body;return body}};
}
test('actual saved Atlas public paper ledger is accepted as research-only source',()=>{
 const input=fixture();
 const actual=validatePrivateCloudSnapshot(input,now());
 assert.equal(actual.realOrdersEnabled,false);
 assert.equal(actual.actualCapitalINR,0);
 assert.equal(actual.runCount,input.runCount);
 assert.equal(actual.recentCheckpoints.at(-1).runCount,actual.runCount);
});
test('private source URL is strictly fixed and read-only token is only in upstream request',async()=>{
 let calls=0;
 const input=fixture();
 const got=await getPrivateCloudSnapshot({token,now:now(),
  fetcher:async (url,options)=>{
   calls++;
   assert.equal(url,'https://api.github.com/repos/hajihaz/Atlas/contents/frontend/public/cloud-paper.json?ref=main');
   assert.equal(options.method,'GET');
   assert.equal(options.redirect,'error');
   assert.equal(options.headers.Authorization,'Bearer '+token);
   assert.equal(options.headers.Accept,'application/vnd.github.raw+json');
   return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(input)};
  }});
 assert.equal(calls,1);
 assert.equal(got.runCount,input.runCount);
 assert.ok(!JSON.stringify(got).includes(token));
});
test('missing token fails before network and HTTP mutation never calls upstream',async()=>{
 await assert.rejects(getPrivateCloudSnapshot({token:'',fetcher:()=>{throw Error('network touched')}}),
  /not_configured/);
 const res=responder();
 await handler({method:'POST'},res);
 assert.equal(res.code,405);
 assert.equal(res.headers.Allow,'GET');
 assert.equal(res.body.error,'method_not_allowed');
});
test('unconfigured production endpoint reveals no credentials and returns unavailable',async()=>{
 const original=process.env.ATLAS_PAPER_READ_TOKEN;
 try{
  delete process.env.ATLAS_PAPER_READ_TOKEN;
  const res=responder();
  await handler({method:'GET'},res);
  assert.equal(res.code,503);
  assert.deepEqual(res.body,{error:'private_paper_source_unavailable'});
  assert.equal(res.headers['Cache-Control'],'no-store');
 }finally{
  if(original===undefined)delete process.env.ATLAS_PAPER_READ_TOKEN;
  else process.env.ATLAS_PAPER_READ_TOKEN=original;
 }
});
test('rejects forged real orders, inconsistent evidence, future timestamps and unsafe prices',()=>{
 const mutations=[
  x=>{x.realOrdersEnabled=true},
  x=>{x.actualCapitalINR=1},
  x=>{x.sessions[0].virtualEquityINR=Infinity},
  x=>{x.sessions[0].events=[{side:'BUY',modeledPriceINR:-1,quantity:1}]},
  x=>{x.recentCheckpoints.at(-1).runCount=x.runCount+1},
  x=>{x.recentCheckpoints.at(-1).newModeledFills=-1},
  x=>{x.lastRunAt='2038-10-23T00:00:00.000Z'},
 ];
 for(const mut of mutations){
  const x=fixture();mut(x);
  assert.throws(()=>validatePrivateCloudSnapshot(x,now()),/invalid_paper_snapshot/);
 }
});
test('private upstream failure, oversize and malformed JSON never become public results',async()=>{
 for(const response of [
  {ok:false,headers:{get:()=>null},text:async()=>''},
  {ok:true,headers:{get:()=>String(140001)},text:async()=>''},
  {ok:true,headers:{get:()=>null},text:async()=>'INVALID JSON'},
  {ok:true,headers:{get:()=>null},text:async()=>'{'+('x'.repeat(140002))+'}'}
 ]){
  await assert.rejects(getPrivateCloudSnapshot({token,now:now(),fetcher:async()=>response}));
 }
});

test('server mirror shares strict daybook proof and rejects inconsistent accounting evidence',()=>{
 const invalid=[
  x=>{x.sessions[0].events=[{side:'BUY',mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL',
     quoteAt:'2039-01-01T00:00:00Z',barClosedAt:'2026-10-22T00:00:00Z',
     modeledPriceINR:1000,feeINR:1,quantity:1,realizedPnlINR:null}]},
  x=>{x.sessions[0].equityHistory[0].equityINR=-1},
  x=>{x.sessions[0].wins=x.sessions[0].closedTrades+1},
  x=>{x.recentCheckpoints[0].sourceCode='BAD\nINVALID'},
  x=>{x.sessions[2].strategyId=x.sessions[0].strategyId},
 ];
 for(const mutation of invalid){
  const data=fixture();mutation(data);
  assert.throws(()=>validatePrivateCloudSnapshot(data,now()),/invalid_paper_snapshot/);
 }
});

test('preview reads only the approved branch and refuses arbitrary refs before network',async()=>{
 let calls=0;
 const fetcher=async url=>{
  calls++;assert.equal(url,'https://api.github.com/repos/hajihaz/Atlas/contents/frontend/public/cloud-paper.json?ref='+encodeURIComponent(APPROVED_PREVIEW_REF));
  return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(fixture())};
 };
 await getPrivateCloudSnapshot({token,now:now(),ref:APPROVED_PREVIEW_REF,fetcher});
 assert.equal(calls,1);
 for(const ref of ['../other','https://evil.invalid','main&path=secret','another-branch'])
  await assert.rejects(getPrivateCloudSnapshot({token,ref,fetcher}),/invalid_paper_source_ref/);
 assert.equal(calls,1);
});
