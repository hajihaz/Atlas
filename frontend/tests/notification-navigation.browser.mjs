// Real-browser regression for notification links navigating an already-open app.
// Read-only: POST/PUT/PATCH/DELETE requests are blocked; no alerts or trades are created.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../node_modules/playwright-core/index.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const base=process.env.ATLAS_BASE_URL??'http://127.0.0.1:4300';
const out=resolve(root,process.env.ATLAS_ACCEPTANCE_DIR??'.ai/raw/notification-navigation');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 executablePath:process.env.ATLAS_CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const checks=[],errors=[],blockedWrites=[];
let failure;
try{
 const context=await browser.newContext({viewport:{width:1440,height:950}});
 await context.route('**/*',route=>{
  const request=route.request();
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){
   blockedWrites.push(request.method()+' '+new URL(request.url()).pathname);
   return route.abort();
  }
  return route.continue();
 });
 const page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 const routeURL=hash=>new URL('/'+hash,base).href;
 async function view(title,text){
  await page.waitForFunction(({title,text})=>{
   const active=[...document.querySelectorAll('button.nav-link')]
    .find(button=>button.title===title&&button.getAttribute('aria-current')==='page');
   return !!active&&document.querySelector('#atlas-main h1')?.textContent?.includes(text);
  },{title,text},{timeout:8000});
 }
 async function check(name,action){await action();checks.push(name);}
 await check('Initial live page',async()=>{
  await page.goto(routeURL(''),{waitUntil:'domcontentloaded'});
  await view('Live Paper Lab','Live market command center');
 });
 await check('Notification fragment navigates an already-open live page',async()=>{
  await page.goto(routeURL('#ipo'));
  await view('IPO Intelligence','IPO Intelligence');
  await page.screenshot({path:resolve(out,'ipo-desktop.png')});
 });
 await check('Supported ScalpStorm fragment changes the visible page',async()=>{
  await page.goto(routeURL('#scalpstorm'));
  await view('ScalpStorm X','ScalpStorm');
 });
 await check('Browser back and forward synchronize the visible page',async()=>{
  await page.goBack();await view('IPO Intelligence','IPO Intelligence');
  await page.goForward();await view('ScalpStorm X','ScalpStorm');
 });
 await check('Leaving ScalpStorm clears its stale fragment',async()=>{
  await page.getByRole('button',{name:'Orders & Activity',exact:true}).click();
  await view('Orders & Activity','Local paper-trading workspace');
  assert.equal(new URL(page.url()).hash,'');
 });
 await check('Notification link closes the mobile menu and focuses content',async()=>{
  await page.setViewportSize({width:320,height:850});
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.getByRole('dialog',{name:'Workspace navigation'}).waitFor();
  await page.goto(routeURL('#ipo'));
  await view('IPO Intelligence','IPO Intelligence');
  await page.waitForFunction(()=>document.querySelector('.mobile-menu')?.getAttribute('aria-expanded')==='false'
   &&document.activeElement?.id==='atlas-main',{},{timeout:5000});
  assert.equal(await page.getByRole('dialog',{name:'Workspace navigation'}).count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:resolve(out,'ipo-mobile.png')});
 });
 await check('Empty and unknown fragments use the live page',async()=>{
  await page.goto(routeURL(''));await view('Live Paper Lab','Live market command center');
  await page.goto(routeURL('#unrecognized-route'));await view('Live Paper Lab','Live market command center');
 });
 assert.deepEqual(blockedWrites,[],'The route regression attempted a non-read request');
 assert.deepEqual(errors,[],'Unexpected browser page errors');
}catch(error){failure=error.message;}
finally{await browser.close();}
const result={checkedAt:new Date().toISOString(),base,checks,passed:!failure,
 errors,blockedWrites,notificationsSent:0,orderControlsClicked:0,...(failure?{failure}:{})};
await writeFile(resolve(out,'acceptance.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
if(failure)process.exitCode=1;
