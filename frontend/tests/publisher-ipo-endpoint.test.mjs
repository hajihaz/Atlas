import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublisherIpoSnapshot} from '../src/lib/publisherIpoValidation.js';
import {getPrivateIpoSnapshot} from '../api/ipo-feed.js';
import {configuredArtifactRef,APPROVED_PREVIEW_REF,RUNTIME_DATA_REF} from '../src/lib/privateArtifact.js';
const now=Date.parse('2026-10-25T06:00:00Z');
function fixture(){
 const observed=new Date(now).toISOString();
 return {schemaVersion:1,sourceKind:'PUBLISHER_AGGREGATE',sourceName:'Publisher fixture',
  sourceURL:'https://www.xflot.com/api-docs',generatedAt:observed,
  disclaimer:'Aggregated public information; GMP is unofficial.',
  attributions:[{name:'Xflot',url:'https://www.xflot.com/api-docs'}],
  coverage:{mainboard:'Tracked records only',sme:'Tracked records only'},warnings:[],
  issues:[{id:'EXAMPLE',company:'Fixture Industries',board:'MAINBOARD',status:'UPCOMING',
   openDate:'2026-10-27',closeDate:'2026-10-29',sourceKind:'PUBLISHER_AGGREGATE',
   sourceObservedAt:observed,sourceUpdatedAt:'2026-10-23T05:00:00Z',sourceStale:false,
   priceMin:100,priceMax:110,lotSize:100,
   subscription:{qib:null,nii:null,retail:null,individual:null,total:null},
   bidDeadline:null,mandateDeadline:null,financials:null,news:[],gmpReadings:[],
   gmp:null,gmpAsOf:null,detailSource:'https://www.xflot.com/api-docs'}]};
}
test('calendar receipt never rewrites old publisher or GMP clocks',()=>{
 const f=fixture(),validated=validatePublisherIpoSnapshot(f,now);
 assert.equal(validated.issues[0].sourceUpdatedAt,'2026-10-23T05:00:00Z');
 assert.equal(validated.issues[0].gmp,null);
});
test('ambiguous identities, impossible dates and inferred bid cutoffs are refused',()=>{
 for(const mutate of [
  f=>f.issues.push({...f.issues[0]}),
  f=>f.issues[0].openDate='2026-02-31',
  f=>f.issues[0].bidDeadline='2026-10-29T17:00:00+05:30',
  f=>f.issues[0].sourceObservedAt='2026-10-25T06:01:00Z',
  f=>f.issues[0].gmp=Infinity,
  f=>f.disclaimer='',
  f=>f.attributions[0].url='javascript:alert(1)',
 ]){const f=fixture();mutate(f);assert.throws(()=>validatePublisherIpoSnapshot(f,now));}
});
test('private reader uses a fixed repository, artifact and explicitly allowed ref',async()=>{
 let request;
 const data=await getPrivateIpoSnapshot({now,ref:RUNTIME_DATA_REF,token:'x'.repeat(24),
  fetcher:async(url,options)=>{request={url,options};return {ok:true,headers:new Headers(),text:async()=>JSON.stringify(fixture())};}});
 assert.equal(data.issues.length,1);
 assert.equal(request.url,'https://api.github.com/repos/hajihaz/Atlas/contents/frontend/public/ipo-feed.json?ref=data%2Fatlas-runtime');
 assert.equal(request.options.redirect,'error');
 assert.equal(request.options.headers.Authorization,'Bearer '+'x'.repeat(24));
});
test('untrusted refs and absent credentials fail before making any request',async()=>{
 const fetcher=()=>assert.fail('network must not run');
 for(const ref of ['other-branch','https://evil.invalid','main&path=secret'])
  await assert.rejects(getPrivateIpoSnapshot({now,ref,token:'x'.repeat(24),fetcher}));
 await assert.rejects(getPrivateIpoSnapshot({now,fetcher}));
});
test('only the reviewed preview may read the Mac report branch',()=>{
 assert.equal(configuredArtifactRef({VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:APPROVED_PREVIEW_REF}),'main');
 assert.equal(configuredArtifactRef({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'unrelated'}),'main');
 assert.equal(configuredArtifactRef({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:APPROVED_PREVIEW_REF}),RUNTIME_DATA_REF);
});
test('oversize or future artifacts are refused',async()=>{
 const read=async body=>getPrivateIpoSnapshot({now,ref:RUNTIME_DATA_REF,token:'x'.repeat(24),
  fetcher:async()=>({ok:true,headers:new Headers(),text:async()=>body})});
 await assert.rejects(read(' '.repeat(500001)));
 const f=fixture();f.generatedAt='2026-10-26T00:00:00Z';
 await assert.rejects(read(JSON.stringify(f)));
});
