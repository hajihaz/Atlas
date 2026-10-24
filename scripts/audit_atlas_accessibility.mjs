#!/usr/bin/env node
// Local-only automated accessibility/keyboard inspection. No provider data requests.
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { sampleGradientContrast } from './a11y_gradient_contrast.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(join(root,'frontend/package.json'));
const {chromium}=require('playwright-core');
const axe=require('axe-core');
const labels=['Live Paper Lab','Overview','Market Watch','IPO Intelligence','Strategies',
  'Research Lab','ScalpStorm X','Risk Center','Orders & Activity','Audit & Evidence'];
const port=Number(process.env.ATLAS_A11Y_PORT??4188);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('A dedicated local port is required');
const origin='http://127.0.0.1:'+port;
const directory=resolve(process.argv[2]??join(root,'.ai/raw/remaining-qa/browser-audit'));
if(existsSync(directory))throw Error('Audit output exists; use a fresh directory');
mkdirSync(directory,{recursive:true,mode:0o700});
const hash=s=>createHash('sha256').update(s).digest('hex');
function fingerprint(){
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','frontend/src','frontend/api','frontend/package.json','frontend/package-lock.json'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean).sort();
 return hash(files.map(p=>p+':'+hash(readFileSync(join(root,p)))).join('\n'));
}
const initialFingerprint=fingerprint();
const report={schema:'atlas.local-accessibility-audit.v1',startedAt:new Date().toISOString(),
  head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  sourceFingerprint:initialFingerprint,engine:'axe-core '+axe.version,
  browser:null,scope:'Ten first-party views, light/dark, desktop/320px; explicit unavailable API states',
  networkPolicy:'Only dedicated loopback app origin; all market APIs return 503; remote HTTP and WebSocket blocked',
  realMarketRequests:0,financialEvidenceCertified:false,realOrdersPlaced:0,
  ruleTags:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'],
  cases:[],keyboard:[],runtimeErrors:[],blockedRemote:0};
let server,browser;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function settle(page){
 await page.locator('main h1').first().waitFor({state:'visible',timeout:15000});
 await page.evaluate(()=>document.fonts.ready);
 await pause(220);
}
async function scan(page,label,viewport,theme,suffix=''){
 const result=await page.evaluate(async tags=>window.axe.run(document,{runOnly:{type:'tag',values:tags}}),report.ruleTags);
 const compact=item=>({id:item.id,impact:item.impact,description:item.description,
  nodes:item.nodes.map(n=>({target:n.target,summary:n.failureSummary,html:n.html.slice(0,600)}))});
 const row={page:label,viewport,theme,state:suffix||'base',heading:await page.locator('main h1').first().innerText(),
  violations:result.violations.map(compact),incomplete:result.incomplete.map(compact),passes:result.passes.length,
  pageOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)};
 row.gradientContrast=await sampleGradientContrast(page,result);
 report.cases.push(row);
 if(row.violations.length||row.gradientContrast.failures.length||row.pageOverflow||label==='ScalpStorm X'){
  const name=label.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+viewport+'-'+theme+(suffix?'-'+suffix:'')+'.png';
  await page.screenshot({path:join(directory,name),fullPage:true});
  row.screenshot=name;
 }
 writeFileSync(join(directory,'checkpoint.json'),JSON.stringify(report,null,2)+'\n');
 process.stdout.write(JSON.stringify({page:label,viewport,theme,state:row.state,violations:row.violations.map(v=>v.id),incomplete:row.incomplete.map(v=>v.id),gradientFailures:row.gradientContrast.failures.length,overflow:row.pageOverflow})+'\n');
}
try{
 server=spawn(process.execPath,[join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:join(root,'frontend'),stdio:['ignore','pipe','pipe']});
 let serverLog='';server.stdout.on('data',x=>{serverLog+=x});server.stderr.on('data',x=>{serverLog+=x});
 for(let i=0;i<100;i++){
  if(server.exitCode!==null)throw Error('Dedicated server failed: '+serverLog.slice(-1200));
  try{const r=await fetch(origin);if(r.ok)break;}catch{}
  if(i===99)throw Error('Dedicated local server did not become ready');
  await pause(200);
 }
 browser=await chromium.launch({channel:'chrome',headless:true});
 report.browser=browser.version();
 for(const viewport of ['desktop','phone'])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:viewport==='desktop'?{width:1440,height:1000}:{width:320,height:900},
    locale:'en-IN',timezoneId:'Asia/Kolkata',colorScheme:theme,reducedMotion:'reduce',serviceWorkers:'allow'});
  await context.addInitScript(({theme,origin})=>{if(window.top===window&&location.origin===origin){try{localStorage.setItem('atlas.theme.preference',theme);}catch{}}},{theme,origin});
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==origin){report.blockedRemote++;return route.abort();}
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'A11Y audit: market/provider unavailable; no trading evidence'})});
   return route.continue();
  });
  await context.routeWebSocket('**/*',socket=>{
   // No connection to live provider sockets; Vite HMR is unnecessary for a frozen audit.
   socket.close({code:1000,reason:'Offline accessibility audit'});
  });
  const page=await context.newPage();
  page.on('pageerror',e=>report.runtimeErrors.push({viewport,theme,error:e.message,stack:e.stack}));
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await settle(page);
  await page.addScriptTag({content:axe.source});
  for(const label of labels){
   if(viewport==='phone')await page.getByRole('button',{name:'Open menu',exact:true}).click();
   await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:label,exact:true}).click();
   await settle(page);
   await scan(page,label,viewport,theme);
  }
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await settle(page);
  const steps=[];
  for(let i=0;i<18;i++){
   await page.keyboard.press('Tab');
   steps.push(await page.evaluate(()=>{
    const el=document.activeElement,r=el.getBoundingClientRect();
    return {tag:el.tagName,name:(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,80),
      offscreen:r.right<=0||r.left>=innerWidth||r.bottom<=0||r.top>=innerHeight};
   }));
  }
  report.keyboard.push({viewport,theme,tabSteps:steps,offscreenFocus:steps.filter(s=>s.offscreen)});
  await context.close();
 }
 report.sourceUnchangedDuringAudit=fingerprint()===initialFingerprint;
 report.completedAt=new Date().toISOString();
 report.automatedPass=report.cases.length===40&&report.cases.every(c=>c.violations.length===0&&c.gradientContrast.failures.length===0&&!c.pageOverflow)
  &&report.keyboard.every(k=>k.offscreenFocus.length===0)&&report.runtimeErrors.length===0&&report.sourceUnchangedDuringAudit;
 report.manualReviewRequired=report.cases.some(c=>c.incomplete.length>0);
 report.fullWcagCertification=false;
 writeFileSync(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
 process.stdout.write(JSON.stringify({cases:report.cases.length,violations:report.cases.reduce((s,c)=>s+c.violations.length,0),
  keyboardFailures:report.keyboard.reduce((s,k)=>s+k.offscreenFocus.length,0),runtimeErrors:report.runtimeErrors.length,automatedPass:report.automatedPass,manualReviewRequired:report.manualReviewRequired})+'\n');
 process.exitCode=report.automatedPass?0:1;
}catch(e){
 report.error=e.stack??String(e);report.automatedPass=false;
 writeFileSync(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
 process.stderr.write(report.error+'\n');process.exitCode=2;
}finally{
 if(browser)await browser.close();
 if(server)server.kill('SIGTERM');
}
