import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {SEVEN_STRATEGIES} from '../src/seven-strategy-replay.js';

const day=process.argv[2];
if(!/^\d{4}-\d\d-\d\d$/.test(day||''))throw Error('day required');
const base='https://atlas-free-cloud-paper.kuddosahib.workers.dev/api/cloud-paper/strategy-journal';
const token=execFileSync('security',['find-generic-password','-a','atlas-private-desk','-s','atlas-free-cloud-paper-owner','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
if(token.length<32)throw Error('owner token unavailable');
const denied=await fetch(base+'?'+new URLSearchParams({day,strategy:SEVEN_STRATEGIES[0].id}));
if(denied.status!==401)throw Error('private route exposed');
const rows=[];
for(const spec of SEVEN_STRATEGIES){
 const res=await fetch(base+'?'+new URLSearchParams({day,strategy:spec.id}),
  {headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
 if(res.status!==200)throw Error('journal HTTP '+res.status+' for '+spec.id);
 const body=await res.json();
 if(body.schema!=='atlas.strategy-journal.v1'||body.mode!=='PAPER_ONLY'||body.realOrdersEnabled!==false||
  body.strategyId!==spec.id||body.sourceDate!==day||!Array.isArray(body.events))throw Error('journal shape');
 rows.push({strategyId:spec.id,status:body.executionStatus,eventCount:body.events.length,
  kinds:Object.fromEntries([...new Set(body.events.map(x=>x.kind))].map(k=>[k,body.events.filter(x=>x.kind===k).length])),
  fills:body.account.fills,pending:body.account.pending,positions:body.account.positions});
}
const result={schema:'atlas.strategy-journal-check.v1',checkedAt:new Date().toISOString(),day,
 unauthenticatedHttp:denied.status,workerMode:'PAPER_ONLY',rows};
const out=process.env.ATLAS_JOURNAL_REPORT;
if(out)writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({day,unauthenticatedHttp:denied.status,strategies:rows.length,
 totalEvents:rows.reduce((n,x)=>n+x.eventCount,0),totalFills:rows.reduce((n,x)=>n+x.fills,0),report:out||null}));
