import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,chmod,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createLocalApiServer} from '../server.js';
import {validateNseMarketSnapshot} from '../src/lib/nseMarketSnapshot.js';

const snapshot=()=>({
  schema:1,mode:'OWNER_NSE_OBSERVATION',status:'OK',source:'Upstox Analytics',
  audience:'OWNER_ONLY',observedAt:new Date().toISOString(),
  market:{exchange:'NSE',status:'CLOSING_END',marketOpen:false},
  quotes:[
    {instrumentKey:'NSE_INDEX|Nifty 50',symbol:'NIFTY 50',priceUnit:'POINTS',lastPrice:22000,volume:null,
      lastTradeAt:'2026-10-23T10:00:00Z',quoteTimestamp:null},
    {instrumentKey:'NSE_EQ|INE002A01018',symbol:'RELIANCE',priceUnit:'INR',lastPrice:1000,volume:123,
      lastTradeAt:null,quoteTimestamp:null},
  ],sourcePayloadSHA256:'a'.repeat(64),realOrdersEnabled:false,
  paperOrdersEnabled:false,actualCapitalINR:0,executionFreshnessCertified:false,
});

test('NSE validation preserves old exchange time without inventing execution freshness',()=>{
  const input=snapshot(),accepted=validateNseMarketSnapshot(input);
  assert.equal(accepted.quotes[0].lastTradeAt,'2026-10-23T10:00:00Z');
  assert.equal(accepted.quotes[1].lastTradeAt,null);
  assert.equal(accepted.quotes[0].priceUnit,'POINTS');
  assert.equal(accepted.executionFreshnessCertified,false);
});

test('NSE projection strips unexpected credential-like fields at every exposed level',()=>{
  const input=snapshot();
  input.token='synthetic-do-not-project';input.market.token='synthetic-do-not-project';
  input.quotes[0].Authorization='synthetic-do-not-project';
  assert.equal(JSON.stringify(validateNseMarketSnapshot(input)).includes('synthetic-do-not-project'),false);
});

test('NSE validation fails closed for stale, future, forged authority and identity',()=>{
  const changes=[
    input=>{input.observedAt=new Date(Date.now()-90001).toISOString();},
    input=>{input.observedAt=new Date(Date.now()+6000).toISOString();},
    input=>{input.realOrdersEnabled=true;},
    input=>{input.paperOrdersEnabled=true;},
    input=>{input.market.marketOpen=true;},
    input=>{input.quotes[0].lastPrice=Infinity;},
    input=>{input.quotes[0].lastTradeAt='2026-10-26T12:00:00';},
    input=>{input.quotes[0].lastTradeAt=new Date(Date.now()+9000).toISOString();},
    input=>{input.quotes[0].priceUnit='INR';},
    input=>{input.quotes[1]=input.quotes[0];},
  ];
  for(const change of changes){
    const input=snapshot();change(input);
    assert.throws(()=>validateNseMarketSnapshot(input));
  }
});

async function fixture(t){
  const root=await mkdtemp(path.join(tmpdir(),'atlas-nse-api-'));
  const folder=path.join(root,'.atlas-runtime');
  await mkdir(folder,{mode:0o700});
  const file=path.join(folder,'nse-market.json');
  await writeFile(file,JSON.stringify(snapshot()),{mode:0o600});
  const server=createLocalApiServer({readOnly:true,ownerRoot:root});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
  return {base:'http://127.0.0.1:'+server.address().port,file,folder};
}

test('owner NSE API accepts same-origin GET and refuses cross-origin access and query parameters',async t=>{
  const {base}=await fixture(t);
  const good=await fetch(base+'/api/nse-market',{headers:{Origin:base}});
  assert.equal(good.status,200);
  assert.equal(good.headers.get('cache-control'),'no-store');
  assert.equal(good.headers.get('access-control-allow-origin'),null);
  assert.equal((await good.json()).source,'Upstox Analytics');
  for(const headers of [{Origin:'https://example.org'},{Origin:'http://127.0.0.1:1'},
    {'Sec-Fetch-Site':'cross-site'}]){
    assert.equal((await fetch(base+'/api/nse-market',{headers})).status,403,JSON.stringify(headers));
  }
  // Node fetch replaces Host; send the DNS-rebinding case through the raw HTTP client.
  const rebound=await new Promise((resolve,reject)=>{
    http.get(base+'/api/nse-market',{headers:{Host:'evil.invalid'}},response=>{
      response.resume();resolve(response.statusCode);
    }).on('error',reject);
  });
  assert.equal(rebound,403);
  assert.equal((await fetch(base+'/api/nse-market?key=x')).status,400);
});

test('isolated readonly owner server rejects writes and disables notification registration',async t=>{
  const {base}=await fixture(t);
  for(const endpoint of ['/api/nse-market','/api/ipo-push','/api/strategy-lab']){
    assert.equal((await fetch(base+endpoint,{method:'POST',body:'{}'})).status,405);
  }
  assert.equal((await fetch(base+'/api/ipo-push')).status,404);
});

test('owner API rejects stale snapshots, public file permissions and symlink substitutions',async t=>{
  const {base,file,folder}=await fixture(t);
  const stale=snapshot();stale.observedAt=new Date(Date.now()-120000).toISOString();
  await writeFile(file,JSON.stringify(stale));
  assert.equal((await fetch(base+'/api/nse-market')).status,503);
  await writeFile(file,JSON.stringify(snapshot()));
  await chmod(file,0o644);
  assert.equal((await fetch(base+'/api/nse-market')).status,503);
  await chmod(file,0o600);
  const original=file+'.original';
  await writeFile(original,JSON.stringify(snapshot()),{mode:0o600});
  await rm(file);await symlink(original,file);
  assert.equal((await fetch(base+'/api/nse-market')).status,503);
  await rm(file);await writeFile(file,JSON.stringify(snapshot()),{mode:0o600});
  await chmod(folder,0o755);
  assert.equal((await fetch(base+'/api/nse-market')).status,503);
});
