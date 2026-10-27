// Combined-branch browser acceptance against synthetic QA responses only.
// Own ephemeral loopback server/profile; no owner runtime, notifications or orders.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../node_modules/playwright-core/index.mjs';
import {getLab} from '../api/strategy-lab.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const dist=resolve(root,'frontend/dist');
const out=resolve(root,'.ai/raw/haor-consolidation-20261026/browser');
await mkdir(out,{recursive:true});
const now=Date.parse('2026-10-26T10:30:00Z'),unit=3600000;
const candles=Array.from({length:90},(_,i)=>({
 time:Math.floor(now/unit)*unit-(90-i)*unit,
 open:100+i/10,close:100+i/10,high:102+i/10,low:99+i/10,volume:20+i,
})).filter((_,i)=>i!==20&&i!==21).slice(0,-5);
const build=async(symbol='BTCINR')=>getLab({symbol},async({symbol,range})=>({
 schema:1,currency:'INR',symbol,range,realOrdersEnabled:false,paperExecutionEnabled:false,
 source:'SYNTHETIC BROWSER QA',generatedAt:new Date(now).toISOString(),
 earliestAvailable:new Date(candles[0].time).toISOString(),
 latestClosedAt:new Date(candles.at(-1).time+unit).toISOString(),
 coverage:'partial',completeHistoryVerified:false,warning:'Synthetic QA fixture; no market evidence.',
 candles,
}),now);
let omitQuality=false;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css',
 '.json':'application/json','.svg':'image/svg+xml','.png':'image/png',
 '.woff2':'font/woff2','.txt':'text/plain'};
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/strategy-lab'){
   const lab=await build(url.searchParams.get('symbol')??'BTCINR');
   if(omitQuality)delete lab.dataQuality;
   res.writeHead(200,{'Content-Type':'application/json'});
   return res.end(JSON.stringify(lab));
  }
  if(url.pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});return res.end('{"error":"isolated_qa"}');}
  let path=resolve(dist,'.'+decodeURIComponent(url.pathname));
  if(!path.startsWith(dist+sep)&&path!==dist){res.writeHead(403);return res.end();}
  if(path===dist||!extname(path))path=resolve(dist,'index.html');
  const bytes=await readFile(path);
  res.writeHead(200,{'Content-Type':mime[extname(path)]??'application/octet-stream'});
  res.end(bytes);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,
 executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const checks=[],errors=[],blockedWrites=[];
let failure;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',route=>{
  const request=route.request();
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){
   blockedWrites.push(request.method()+' '+new URL(request.url()).pathname);
   return route.abort();
  }
  if(new URL(request.url()).origin!==base)return route.abort();
  return route.continue();
 });
 await context.routeWebSocket(/.*/,socket=>socket.close());
 const page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 const check=async(name,fn)=>{await fn();checks.push(name);};
 await check('Existing ScalpStorm source evidence remains distinct from invented sandbox',async()=>{
  await page.goto(base+'/#scalpstorm');
  await page.getByRole('heading',{name:'ScalpStorm X.',exact:true}).waitFor();
  assert.match(await page.locator('.scalp-summary').innerText(),/0\s*\/\s*20/);
  const sandbox=page.locator('details').filter({hasText:'Offline synthetic research sandbox'});
  assert.equal(await sandbox.getAttribute('open'),null);
  await sandbox.locator('summary').click();
  const panel=page.getByRole('region',{name:'Day Trader NSE offline research'});
  await panel.getByText('Invented aggregate net P/L',{exact:true}).waitFor();
  assert.match(await panel.innerText(),/SYNTHETIC FIXTURE/);
  assert.match(await panel.innerText(),/No genuine NSE market observations were used/);
  assert.equal(await panel.locator('button').count(),0);
  await panel.getByLabel('Inspect an invented session').selectOption('2');
  await page.screenshot({path:resolve(out,'scalpstorm-synthetic-separation.png'),fullPage:true});
 });
 await check('Research limitations show gaps and staleness before modeled metrics',async()=>{
  await page.getByRole('button',{name:'Research Lab',exact:true}).click();
  await page.getByRole('heading',{name:'Historical data limitations',exact:true}).waitFor();
  const notice=page.locator('aside').filter({hasText:'Historical data limitations'});
  assert.match(await notice.innerText(),/2 missing intervals/);
  assert.match(await notice.innerText(),/more than two intervals old/);
  assert.match(await notice.innerText(),/Cross-source/);
  assert.match(await notice.innerText(),/Source rights/);
  assert.equal(await page.evaluate(()=>{
   const note=document.querySelector('aside[aria-labelledby="research-quality-title"]');
   const metrics=document.querySelector('.research-metric-grid');
   return !!note&&!!metrics&&Boolean(note.compareDocumentPosition(metrics)&Node.DOCUMENT_POSITION_FOLLOWING);
  }),true);
  await page.getByRole('slider').waitFor();
  await page.screenshot({path:resolve(out,'research-quality-desktop.png'),fullPage:true});
 });
 await check('Legacy response missing quality metadata shows explicit unavailable warning',async()=>{
  omitQuality=true;
  await page.getByLabel('Market / INR').selectOption('ETHINR');
  await page.getByText('Data-quality evidence is unavailable. Results remain uncertified.',{exact:true}).waitFor();
 });
 await check('Combined research and synthetic disclosure fit 320-pixel viewport',async()=>{
  await page.setViewportSize({width:320,height:900});
  await page.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.app-body')).marginLeft)===0);
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1,{},{timeout:5000}).catch(()=>{});
  const overflow=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,
   elements:[...document.querySelectorAll('#atlas-main *')].filter(element=>{
    const rect=element.getBoundingClientRect();return rect.right>innerWidth+1&&rect.width>0;
   }).map(element=>({tag:element.tagName,cls:element.className,text:element.textContent?.slice(0,100),
    width:element.getBoundingClientRect().width,right:element.getBoundingClientRect().right})).slice(0,25)}));
  await writeFile(resolve(out,'mobile-layout.json'),JSON.stringify(overflow,null,2));
  await page.screenshot({path:resolve(out,'research-quality-mobile.png'),fullPage:true});
  assert.ok(overflow.width<=overflow.viewport+1,JSON.stringify(overflow));
  await page.goto(base+'/#scalpstorm');
  await page.getByRole('heading',{name:'ScalpStorm X.',exact:true}).waitFor();
  await page.locator('summary').filter({hasText:'Offline synthetic research sandbox'}).click();
  await page.getByRole('region',{name:'Day Trader NSE offline research'}).getByText('Invented aggregate net P/L',{exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 });
 assert.deepEqual(blockedWrites,[]);
 assert.deepEqual(errors,[]);
}catch(error){failure=error.stack??String(error);}
finally{await browser.close();await new Promise(done=>server.close(done));}
const result={checkedAt:new Date().toISOString(),passed:!failure,checks,errors,blockedWrites,
 fixture:'SYNTHETIC QA ONLY',ownerRuntimeAccessed:false,notificationsSent:0,ordersSubmitted:0,
 ...(failure?{failure}:{})};
await writeFile(resolve(out,'acceptance.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
if(failure)process.exitCode=1;
