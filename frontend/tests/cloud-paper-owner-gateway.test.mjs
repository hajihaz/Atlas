import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/cloud-paper.js';
const reply=()=>({headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;return this},
 status(n){this.statusCode=n;return this},json(data){this.body=data;return this}});
const req=(segments,method='GET',authorization='')=>({query:{action:Array.isArray(segments)?segments.join('/'):segments},method,
 headers:{authorization,'content-type':'application/json'},body:{enabled:true}});

test('gateway unconfigured status remains visibly disabled',async()=>{
 const prev=process.env.ATLAS_PAPER_BACKEND_URL;
 delete process.env.ATLAS_PAPER_BACKEND_URL;
 try{
  const r=reply();await handler(req(['status']),r);
  assert.equal(r.statusCode,200);assert.equal(r.body.configured,false);
  assert.equal(r.body.realOrdersEnabled,false);
  const no=reply();await handler(req(['state'],'GET','Bearer '+'A'.repeat(64)),no);
  assert.equal(no.statusCode,503);
 }finally{if(prev===undefined)delete process.env.ATLAS_PAPER_BACKEND_URL;
  else process.env.ATLAS_PAPER_BACKEND_URL=prev}
});

test('gateway refuses arbitrary and quote routes',async()=>{
 const a=reply();await handler(req(['quotes'],'POST'),a);assert.equal(a.statusCode,404);
 const b=reply();await handler(req(['state','..','admin']),b);assert.equal(b.statusCode,404);
 const c=reply();await handler(req(['status'],'POST'),c);assert.equal(c.statusCode,405);
 const d=reply();await handler(req(['strategy'],'POST','Bearer '+'X'.repeat(64)),d);assert.equal(d.statusCode,404);
});

test('gateway forwards only authorized private owner calls over configured HTTPS',async()=>{
 const old=process.env.ATLAS_PAPER_BACKEND_URL, saved=globalThis.fetch;
 process.env.ATLAS_PAPER_BACKEND_URL='https://paper.example';
 let called=0;
 globalThis.fetch=async (url,opts)=>{
  called++;
  assert.equal(url,'https://paper.example/api/cloud-paper/state');
  assert.equal(opts.headers.Authorization,'Bearer '+'X'.repeat(64));
  return {status:200,headers:{get:()=> 'application/json; charset=utf-8'},json:async()=>({mode:'PAPER_ONLY',realOrdersEnabled:false})};
 };
 try{
  const un=reply();await handler(req(['state']),un);assert.equal(un.statusCode,401);assert.equal(called,0);
  const a=reply();await handler(req(['state'],'GET','Bearer '+'X'.repeat(64)),a);
  assert.equal(a.statusCode,200);assert.equal(called,1);assert.equal(a.body.mode,'PAPER_ONLY');
 }finally{globalThis.fetch=saved;if(old===undefined)delete process.env.ATLAS_PAPER_BACKEND_URL;
  else process.env.ATLAS_PAPER_BACKEND_URL=old}
});

test('gateway verifies live worker readiness rather than URL alone',async()=>{
 const previous=process.env.ATLAS_PAPER_BACKEND_URL,oldFetch=globalThis.fetch;
 process.env.ATLAS_PAPER_BACKEND_URL='https://paper.example';
 let calls=0;
 globalThis.fetch=async (url)=>{
  calls++;assert.equal(url,'https://paper.example/healthz');
  return {ok:true,headers:{get:()=> 'application/json'},json:async()=>({
   mode:'PAPER_ONLY',realOrdersEnabled:false,backendConnected:true,configured:false,feedSourceConfigured:false})};
 };
 try{
  const res=reply();await handler(req('status'),res);
  assert.equal(res.statusCode,200);assert.equal(res.body.backendConnected,true);
  assert.equal(res.body.configured,false);assert.equal(res.body.realOrdersEnabled,false);
  assert.equal(calls,1);
 }finally{globalThis.fetch=oldFetch;
  if(previous===undefined)delete process.env.ATLAS_PAPER_BACKEND_URL;
  else process.env.ATLAS_PAPER_BACKEND_URL=previous;
 }
});

test('gateway forwards only signed-session cookie and blocks cross-origin cookie writes',async()=>{
 const old=process.env.ATLAS_PAPER_BACKEND_URL,saved=globalThis.fetch;
 process.env.ATLAS_PAPER_BACKEND_URL='https://paper.example';
 const value='v1.1793630000.'+'a'.repeat(32)+'.'+'b'.repeat(64);
 let calls=0;
 globalThis.fetch=async (url,opts)=>{
  calls++;
  assert.equal(url,'https://paper.example/api/cloud-paper/state');
  assert.equal(opts.headers.Cookie,'atlas_owner_session='+value);
  assert.equal(opts.headers.Authorization,undefined);
  return {status:200,headers:{get:k=>k==='content-type'?'application/json':null},json:async()=>({mode:'PAPER_ONLY',realOrdersEnabled:false})};
 };
 try{
  const input=req('state');input.headers.cookie='noise=ignored; atlas_owner_session='+value;
  const ok=reply();await handler(input,ok);assert.equal(ok.statusCode,200);assert.equal(calls,1);
  const write=req('orders','POST');write.headers.cookie='atlas_owner_session='+value;
  write.headers.host='atlas-control-center-pi.vercel.app';write.headers.origin='https://evil.example';
  const rejected=reply();await handler(write,rejected);assert.equal(rejected.statusCode,403);assert.equal(calls,1);
 }finally{globalThis.fetch=saved;if(old===undefined)delete process.env.ATLAS_PAPER_BACKEND_URL;else process.env.ATLAS_PAPER_BACKEND_URL=old;}
});

test('gateway exchanges owner bearer for protected cookie without exposing token',async()=>{
 const old=process.env.ATLAS_PAPER_BACKEND_URL,saved=globalThis.fetch;
 process.env.ATLAS_PAPER_BACKEND_URL='https://paper.example';
 const bearer='Bearer '+'X'.repeat(64);
 globalThis.fetch=async(url,opts)=>{
  assert.equal(url,'https://paper.example/api/cloud-paper/session');
  assert.equal(opts.headers.Authorization,bearer);
  return {status:200,headers:{get:k=>k==='content-type'?'application/json':
   k==='set-cookie'?'atlas_owner_session=v1.1793630000.'+'a'.repeat(32)+'.'+'b'.repeat(64)+'; Path=/api/cloud-paper; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict':null},
   json:async()=>({connected:true,mode:'PAPER_ONLY',realOrdersEnabled:false})};
 };
 try{
  const output=reply();await handler(req('session','POST',bearer),output);
  assert.equal(output.statusCode,200);
  assert.match(output.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);
  assert.ok(!JSON.stringify(output.body).includes('X'.repeat(64)));
 }finally{globalThis.fetch=saved;if(old===undefined)delete process.env.ATLAS_PAPER_BACKEND_URL;else process.env.ATLAS_PAPER_BACKEND_URL=old;}
});
