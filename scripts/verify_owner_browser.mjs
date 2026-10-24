#!/usr/bin/env node
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createLocalApiServer} from '../frontend/server.js';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const {chromium}=require('playwright-core');
const out=new URL('../.ai/raw/owner-browser/',import.meta.url);
mkdirSync(out,{recursive:true});
const server=createLocalApiServer({serveBuild:true});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(4193,'127.0.0.1',ok);});
const origin='http://127.0.0.1:4193';
let browser;
const report={scope:'Actual owner-local ledger; explicitly artificial chart fixture; no live market requests or real orders',checks:[],runtimeErrors:[]};
try{
 const response=await fetch(origin+'/api/local-paper');
 assert.equal(response.status,200);
 const ledger=await response.json();
 assert.equal(ledger.realOrdersEnabled,false);
 assert.equal(ledger.accounts.length,2);
 assert.ok(ledger.accounts.every(a=>a.accountingVerified&&a.riskHalted&&!a.active));
 report.checks.push('actual source accounting and risk halt');
 for(const options of [{method:'POST'},{headers:{Origin:'https://evil.invalid'}}]){
  const r=await fetch(origin+'/api/local-paper',options);assert.ok([403,405].includes(r.status));
 }
 const badHost=await new Promise((resolve,reject)=>{const r=http.get(origin+'/api/local-paper',{headers:{Host:'evil.invalid'}},response=>{response.resume();resolve(response.statusCode)});r.on('error',reject)});
 assert.equal(badHost,403);
 report.checks.push('mutation, foreign Origin and rebinding Host rejected');
 for(const path of ['/.env','/.git/config','/%2e%2e/pyproject.toml','/api/order','/api/local-paper/extra']){
  assert.equal((await fetch(origin+path)).status,404);
 }
 report.checks.push('private files and order routes inaccessible');
 const push=await (await fetch(origin+'/api/ipo-push')).json();
 assert.equal(push.mode,'OWNER_LOCAL_ONLY');assert.equal(typeof push.publicKey,'string');assert.equal(push.privateKey,undefined);
 assert.equal((await fetch(origin+'/api/ipo-push',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 report.checks.push('push setup contains public key only; unpaired mutation denied');
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin!==origin)return route.abort();
  if(u.pathname==='/api/market-history'){
   const now=Date.now(),base=now-180000;
   const candles=[0,1,2].map(i=>({time:base+i*60000,open:100+i,high:105+i,low:99+i,close:103+i,volume:10}));
   return route.fulfill({contentType:'application/json',body:JSON.stringify({schema:1,symbol:'BTCINR',range:u.searchParams.get('range'),currency:'INR',candles,source:'EXPLICIT ARTIFICIAL CHART TEST',coverage:'partial',latestClosedAt:new Date(base+120000).toISOString(),completeHistoryVerified:false,warning:'ARTIFICIAL CHART FIXTURE — NOT MARKET DATA',paperExecutionEnabled:false,realOrdersEnabled:false})});
  }
  if(u.pathname.startsWith('/api/')&&!['/api/local-paper','/api/ipo-push'].includes(u.pathname))
   return route.fulfill({status:503,contentType:'application/json',body:'{}'});
  return route.continue();
 });
 await context.routeWebSocket('**/*',socket=>socket.close());
 const page=await context.newPage();
 page.on('pageerror',e=>report.runtimeErrors.push(e.message));
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.getByText('atlas-btc-sma · BTCINR · Risk halted',{exact:true}).waitFor();
 assert.ok((await page.locator('canvas').count())>0);
 await page.getByText('ARTIFICIAL CHART FIXTURE — NOT MARKET DATA',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Daily breakdown',exact:true}).first().click();
 assert.ok((await page.getByRole('table').count())>0);
 await page.getByRole('button',{name:/View recorded trades for/}).first().click();
 await page.getByRole('heading',{name:/Recorded trades ·/}).waitFor();
 await page.getByRole('table').filter({has:page.locator('caption',{hasText:'actual source records, modeled paper fills'})}).waitFor();
 assert.ok((await page.getByRole('region',{name:'Recorded trade events; scroll horizontally'}).locator('tbody tr').count())>0);
 await page.getByRole('region',{name:'Selected account monthly paper totals; scroll horizontally'}).waitFor();
 report.checks.push('UI renders actual risk-halted accounts, monthly totals and verified day trade records');
 report.checks.push('installed chart renders provider-shaped artificial OHLC; no invented market claim');
 await page.screenshot({path:new URL('desktop.png',out).pathname,fullPage:true});
 await page.setViewportSize({width:320,height:900});
 await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1,null,{timeout:3000});
 const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+2&&r.width>0}).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent?.slice(0,100),width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,50));
 writeFileSync(new URL('overflow.json',out),JSON.stringify(overflow,null,2));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 report.checks.push('320px layout has no page overflow');
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.getByRole('heading',{name:'Live market command center.'}).waitFor();
 await context.setOffline(true);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Live market command center.'}).waitFor();
 report.checks.push('installed service worker serves app shell offline');
 const caches=await page.evaluate(async()=>{const out=[];for(const name of await window.caches.keys())for(const req of await (await window.caches.open(name)).keys())out.push(new URL(req.url).pathname);return out;});
 assert.ok(caches.every(path=>path==='/'||path.startsWith('/assets/')));
 report.checks.push('no financial JSON, API or subscription material cached');
 assert.deepEqual(report.runtimeErrors,[]);
 report.passed=true;
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
 writeFileSync(new URL('report.json',out),JSON.stringify(report,null,2)+'\n');
}
