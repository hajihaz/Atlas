#!/usr/bin/env node
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(join(root,'frontend/package.json'));
const {chromium}=require('playwright-core');
const output=resolve(process.argv[2]);
if(existsSync(output))throw Error('Output exists');
const origin='http://127.0.0.1:4191';
const server=spawn(process.execPath,[join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4191','--strictPort'],{cwd:join(root,'frontend'),stdio:'ignore'});
let browser;
try{
 let ready=false;
 for(let i=0;i<100;i++){try{if((await fetch(origin)).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.ok(ready,'Dedicated app server starts');
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:320,height:900},reducedMotion:'reduce'});
 await context.route('**/*',r=>{const u=new URL(r.request().url());return u.origin!==origin?r.abort():u.pathname.startsWith('/api/')?r.fulfill({status:503,body:'{}'}):r.continue()});
 await context.routeWebSocket('**/*',s=>s.close());
 const page=await context.newPage();await page.goto(origin);
 const open=page.getByRole('button',{name:'Open menu',exact:true});
 await open.click();
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Close menu');
 assert.equal(await page.locator('#atlas-sidebar').getAttribute('aria-modal'),'true');
 const inside=()=>page.evaluate(()=>!!document.activeElement?.closest('#atlas-sidebar'));
 for(let i=0;i<30;i++){await page.keyboard.press('Tab');assert.ok(await inside(),'Forward focus stays in drawer')}
 for(let i=0;i<30;i++){await page.keyboard.press('Shift+Tab');assert.ok(await inside(),'Reverse focus stays in drawer')}
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Open menu');
 assert.equal(await page.locator('#atlas-sidebar').getAttribute('inert'),'');
 await open.click();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Risk Center',exact:true}).click();
 await page.waitForFunction(()=>document.activeElement?.id==='atlas-main');
 assert.equal(await page.locator('#atlas-sidebar').getAttribute('inert'),'');
 await page.setViewportSize({width:1440,height:1000});
 await page.waitForFunction(()=>!document.getElementById('atlas-sidebar')?.inert);
 writeFileSync(output,JSON.stringify({passed:true,checks:['open focus','dialog semantics','30 forward tabs trapped','30 reverse tabs trapped','Escape restores trigger focus','closed menu inert','navigation focuses main','desktop resize restores sidebar'],realMarketRequests:0,realOrders:0},null,2)+'\n');
}finally{await browser?.close();server.kill();}
