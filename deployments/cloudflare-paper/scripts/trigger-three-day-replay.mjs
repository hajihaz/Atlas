import {execFileSync} from 'node:child_process';
import {COHORT_SYMBOLS} from '../src/upstox-history-cohort.js';
import {SEVEN_STRATEGIES} from '../src/seven-strategy-replay.js';
const base='https://atlas-free-cloud-paper.kuddosahib.workers.dev';
const token=execFileSync('security',['find-generic-password','-a','atlas-private-desk','-s','atlas-free-cloud-paper-owner','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
if(token.length<32)throw Error('owner token unavailable');
const auth={Authorization:'Bearer '+token};
async function get(path){const r=await fetch(base+path,{headers:auth,signal:AbortSignal.timeout(20000)});let body;try{body=await r.json()}catch{body={error:'non-JSON response'}}return {status:r.status,body};}
const days=['2026-10-28','2026-10-29','2026-10-30'];
const strategies=SEVEN_STRATEGIES.filter(s=>s.cadence==='INTRADAY').map(s=>s.id);
const before=await get('/api/cloud-paper/seven-accounts');
if(before.status!==200)throw Error('seven account read failed: '+before.status);
const smoke=await get('/api/cloud-paper/strategy-replay?'+new URLSearchParams({day:days[0],symbol:COHORT_SYMBOLS[0],strategy:strategies[0]}));
if(process.argv.includes('--smoke')){console.log(JSON.stringify({smokeStatus:smoke.status,smokeError:smoke.status===200?null:smoke.body?.error,smokeResult:smoke.status===200?{session:smoke.body.result?.session,strategyId:smoke.body.result?.strategyId,closedTrades:smoke.body.result?.closedTrades,sourceSha256:smoke.body.sourceSha256}:null}));process.exit(smoke.status===200?0:1)}
if(smoke.status!==200)throw Error('strategy replay smoke failed: '+smoke.status+' '+String(smoke.body?.error||''));
const jobs=days.flatMap(day=>COHORT_SYMBOLS.flatMap(symbol=>strategies.map(strategy=>({day,symbol,strategy}))));
const results=[],failures=[];
for(let i=0;i<jobs.length;i+=4){
 const batch=jobs.slice(i,i+4);
 const replies=await Promise.all(batch.map(async job=>{
  try{return {job,reply:await get('/api/cloud-paper/strategy-replay?'+new URLSearchParams(job))}}
  catch(e){return {job,error:String(e?.message||e)}}
 }));
 for(const {job,reply,error} of replies){
  if(error||reply.status!==200||reply.body?.result?.status!=='MODELED'||reply.body?.result?.session!==job.day||reply.body?.result?.strategyId!==job.strategy||reply.body?.symbol!==job.symbol||!/^([a-f0-9]{64})$/.test(reply.body?.sourceSha256||'')){
   failures.push({job,status:reply?.status||null,error:error||reply?.body?.error||'invalid response'});continue;
  }
  const x=reply.body;
  results.push({day:job.day,symbol:job.symbol,strategy:job.strategy,sourceSha256:x.sourceSha256,sourceKnownAt:x.sourceKnownAt,capitalPaise:x.result.capitalPaise,realizedPaise:x.result.realizedPaise,closedTrades:x.result.closedTrades,wins:x.result.wins,feesPaise:x.result.feesPaise,endingCashPaise:x.result.endingCashPaise});
 }
}
const after=await get('/api/cloud-paper/seven-accounts');
const period={};
for(const strategy of SEVEN_STRATEGIES.filter(s=>s.cadence!=='INTRADAY').map(s=>s.id)){
 const x=await get('/api/cloud-paper/period-rank?'+new URLSearchParams({source_day:'2026-10-30',as_of_day:'2026-11-02',strategy}));
 period[strategy]={status:x.status,resultStatus:x.body?.status||null,error:x.status===200?null:x.body?.error||null};
}
const groups={};
for(const x of results){const key=x.day+'|'+x.strategy;const g=groups[key]??={day:x.day,strategy:x.strategy,symbols:0,capitalPaise:0,realizedPaise:0,trades:0,wins:0,feesPaise:0};g.symbols++;g.capitalPaise+=x.capitalPaise;g.realizedPaise+=x.realizedPaise;g.trades+=x.closedTrades;g.wins+=x.wins;g.feesPaise+=x.feesPaise;}
for(const g of Object.values(groups)){g.returnPct=Math.round(g.realizedPaise/g.capitalPaise*10000)/100;g.winRatePct=g.trades?Math.round(g.wins/g.trades*10000)/100:null;}
const receiptMap={};for(const x of results){const key=x.day+'|'+x.symbol;if(receiptMap[key]&&receiptMap[key]!==x.sourceSha256)failures.push({job:{day:x.day,symbol:x.symbol},error:'source hash changed across strategy reads'});receiptMap[key]=x.sourceSha256;}
console.log(JSON.stringify({runAt:new Date().toISOString(),model:'Atlas deployed Worker retrospective replay on fixed 10-symbol cohort; each day independently reset; not 09:40/live or broker execution',expectedCalls:jobs.length,successfulCalls:results.length,failures,groups:Object.values(groups).sort((a,b)=>a.day.localeCompare(b.day)||a.strategy.localeCompare(b.strategy)),period,accountStateUnchanged:before.status===200&&after.status===200&&JSON.stringify(before.body)===JSON.stringify(after.body),sourceReceipts:receiptMap,workerVersion:'7af8e392-a1b2-48a0-bf42-57ae6b3e79b0'}));
