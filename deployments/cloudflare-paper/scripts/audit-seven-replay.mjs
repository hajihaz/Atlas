/** Read-only audit of deployed seven-rule replay; never invokes paper orders. */
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {SEVEN_STRATEGIES} from '../src/seven-strategy-replay.js';

const day=process.argv[2];
if(!/^\d{4}-\d\d-\d\d$/.test(day||''))throw Error('source day required');
const token=execFileSync('security',['find-generic-password','-a','atlas-private-desk','-s','atlas-free-cloud-paper-owner','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
if(token.length<32)throw Error('owner token unavailable');
const base='https://atlas-free-cloud-paper.kuddosahib.workers.dev';
async function get(path){
 const r=await fetch(base+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
 let x;try{x=await r.json()}catch{x={error:'NON_JSON'}}
 return {http:r.status,body:x};
}
const top=await get('/api/cloud-paper/top-volume-history?day='+day);
if(top.http!==200)throw Error('top-volume source unavailable HTTP '+top.http);
const stocks=top.body.stocks;
if(!Array.isArray(stocks)||stocks.length!==10||stocks.some(x=>!x.archived||x.minuteBars!==375))
 throw Error('top-volume history incomplete');
const results=[];
for(const spec of SEVEN_STRATEGIES.filter(x=>x.cadence==='INTRADAY')){
 for(const stock of stocks){
  const q=new URLSearchParams({day,symbol:stock.symbol,strategy:spec.id});
  const x=await get('/api/cloud-paper/strategy-replay?'+q);
  results.push({strategy:spec.id,symbol:stock.symbol,http:x.http,status:x.body.status??null,
   sourceSha256:x.body.sourceSha256??null,resultStatus:x.body.result?.status??null,
   reason:x.body.result?.reason??x.body.diagnostic??x.body.error??null,
   modeledFills:x.body.result?.fills?.length??0});
 }
}
const summary=Object.fromEntries(SEVEN_STRATEGIES.filter(x=>x.cadence==='INTRADAY').map(s=>{
 const rows=results.filter(x=>x.strategy===s.id),statuses={};
 for(const row of rows)statuses[row.status??'ERROR']=(statuses[row.status??'ERROR']||0)+1;
 return [s.id,statuses];
}));
const period={};
const asOf=new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);
for(const spec of SEVEN_STRATEGIES.filter(x=>x.cadence!=='INTRADAY')){
 const q=new URLSearchParams({source_day:day,as_of_day:asOf,strategy:spec.id});
 const x=await get('/api/cloud-paper/period-rank?'+q);
 period[spec.id]={http:x.http,status:x.body.status??null,
  reason:x.body.reason??x.body.diagnostic??x.body.error??null};
}
const accounts=await get('/api/cloud-paper/seven-accounts');
const report={schema:'atlas.seven-replay-audit.v1',auditedAt:new Date().toISOString(),sourceDay:day,
 evidenceClass:'RETROSPECTIVE_REPLAY_NOT_FORWARD_FILL',summary,period,results,
 paperFills:accounts.body.accounts?.reduce((n,a)=>n+a.paperFills,0)??null,realOrdersEnabled:false};
const out=process.env.ATLAS_REPLAY_AUDIT_REPORT;
if(out)writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({day,summary,period,paperFills:report.paperFills,report:out||null}));
