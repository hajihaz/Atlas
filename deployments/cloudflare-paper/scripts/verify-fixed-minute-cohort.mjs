import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {COHORT_SYMBOLS,cohortSpec} from '../src/upstox-history-cohort.js';

const paths=process.argv.slice(2),reports=paths.map(p=>JSON.parse(readFileSync(p,'utf8')));
const dates=[...new Set(reports.flatMap(x=>x.sourceSessionDates))].sort();
if(!dates.length||reports.some(x=>x.failures.length))throw Error('incomplete backfill reports');
const token=execFileSync('security',['find-generic-password','-a','atlas-private-desk','-s','atlas-free-cloud-paper-owner','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
if(token.length<32)throw Error('owner token unavailable');
const base='https://atlas-free-cloud-paper.kuddosahib.workers.dev';
async function get(path){
 const r=await fetch(base+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
 if(r.status!==200)throw Error('Atlas read HTTP '+r.status);
 return r.json();
}
const availability=await get('/api/cloud-paper/data-availability');
const byDay=new Map(availability.minute.dates.map(x=>[x.day,x]));
const receipts=[];
for(const day of dates){
 const count=byDay.get(day);
 if(count?.symbols!==10||count.min_bars!==375||count.max_bars!==375)throw Error('incomplete cloud minute day '+day);
 const listed=await get('/api/cloud-paper/history-cohort?day='+day);
 const keys=new Set(COHORT_SYMBOLS.map(symbol=>cohortSpec({source_date:day,symbol}).key));
 if(listed.archived_symbol_days!==10||listed.samples.length!==10||
    listed.samples.some(x=>!keys.has(x.instrument_key)||x.candle_count!==375||!/^([a-f0-9]{64})$/.test(x.body_sha256||'')))
   throw Error('unqualified dated receipt '+day);
 receipts.push({day,symbols:10,bars:375,hashes:listed.samples.map(x=>x.body_sha256)});
}
const account=await get('/api/cloud-paper/seven-accounts');
const result={schema:'atlas.fixed-cohort-verification.v1',checkedAt:new Date().toISOString(),
 firstDate:dates[0],lastDate:dates.at(-1),sessions:dates.length,symbolDays:receipts.length*10,
 minuteBars:receipts.length*3750,sourceClass:'FIXED_TEN_STOCK_SAMPLE_NOT_FULL_MARKET_0940',
 paperAccounts:account.accounts.length,paperFills:account.accounts.reduce((n,x)=>n+x.paperFills,0),
 receipts,realOrdersEnabled:false};
const out=process.env.ATLAS_VERIFY_REPORT;
if(out)writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({sessions:result.sessions,symbolDays:result.symbolDays,minuteBars:result.minuteBars,
 paperAccounts:result.paperAccounts,paperFills:result.paperFills,report:out||null}));
