/** Resume a bounded, owner-only historical sample backfill. No raw data leaves Atlas. */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {COHORT_SYMBOLS,cohortSpec} from '../src/upstox-history-cohort.js';

const dataRoot=process.env.ATLAS_REFERENCE_DATA_ROOT||'/Users/hajihaz/Documents/ChatGPT/Stock market and finance/data/raw';
const base='https://atlas-free-cloud-paper.kuddosahib.workers.dev';
const maxNew=Number(process.argv[2]||20);
if(!Number.isInteger(maxNew)||maxNew<1||maxNew>50)throw Error('max-new must be 1..50');
const token=execFileSync('security',['find-generic-password','-a','atlas-private-desk','-s','atlas-free-cloud-paper-owner','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
if(token.length<32)throw Error('owner token unavailable');
const auth={Authorization:'Bearer '+token};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function validReceipt(file,body,day){
 if(!existsSync(file)||!existsSync(body))return false;
 const x=JSON.parse(readFileSync(file,'utf8'));
 if((x.source_date??x.session)!==day||!/^([a-f0-9]{64})$/.test(x.source_sha256||''))return false;
 const bytes=readFileSync(body);
 return bytes.length===x.source_bytes&&createHash('sha256').update(bytes).digest('hex')===x.source_sha256;
}
function sessionDates(){
 const eod=new Set(readdirSync(dataRoot+'/nse').map(x=>/^BhavCopy_NSE_CM_0_0_0_(\d{8})_F_0000\.csv\.zip$/.exec(x)?.[1]).filter(Boolean));
 const dates=[];
 for(const tag of eod){
  const day=tag.slice(0,4)+'-'+tag.slice(4,6)+'-'+tag.slice(6);
  if(day<'2026-09-24'||day>=new Date().toISOString().slice(0,10))continue;
  const dd=tag.slice(6)+tag.slice(4,6)+tag.slice(0,4);
  const eodName='BhavCopy_NSE_CM_0_0_0_'+tag+'_F_0000.csv';
  const masterName='NSE_CM_security_'+dd+'.csv';
  if(validReceipt(dataRoot+'/nse/'+eodName+'.receipt.json',dataRoot+'/nse/'+eodName+'.zip',day)&&
     validReceipt(dataRoot+'/nse_security/'+masterName+'.receipt.json',dataRoot+'/nse_security/'+masterName+'.gz',day))dates.push(day);
 }
 return dates.sort();
}
async function request(path,body){
 const res=await fetch(base+path,{method:body?'POST':'GET',headers:body?{...auth,'Content-Type':'application/json'}:auth,
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 let value;try{value=await res.json()}catch{value={error:'NON_JSON'}}
 if(res.status!==200)throw Error('Atlas HTTP '+res.status+' '+String(value.diagnostic||value.error||'unknown').slice(0,120));
 return value;
}
const dates=sessionDates(),results=[],failures=[];
if(!dates.length)throw Error('no locally verified dated NSE EOD/master pairs');
let remaining=maxNew;
for(const day of dates){
 const listing=await request('/api/cloud-paper/history-cohort?day='+day);
 const present=new Set(listing.samples.map(x=>x.instrument_key));
 for(const symbol of COHORT_SYMBOLS){
  if(remaining===0)break;
  const key=cohortSpec({source_date:day,symbol}).key;
  if(present.has(key))continue;
  try{
   const x=await request('/api/cloud-paper/history-cohort',{source_date:day,symbol});
   if(x.status!=='CAPTURED'||x.source_date!==day||x.symbol!==symbol||!/^([a-f0-9]{64})$/.test(x.body_sha256||''))throw Error('invalid archive receipt');
   results.push({day,symbol,sha256:x.body_sha256,bars:x.candle_count,knownAt:x.known_at_utc,evidenceClass:x.evidence_class});
   remaining--;
  }catch(error){failures.push({day,symbol,error:String(error.message).slice(0,140)});if(failures.length>=3)break;}
  await sleep(1500);
 }
 if(remaining===0||failures.length>=3)break;
}
const report={schema:'atlas.fixed-cohort-backfill.v1',runAt:new Date().toISOString(),sourceSessionDates:dates,
 evidenceClass:'FIXED_WATCHLIST_SAMPLE_NOT_HISTORICAL_0940_UNIVERSE',requestedMaxNew:maxNew,captured:results,failures};
const out=process.env.ATLAS_BACKFILL_REPORT;
if(out)writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({sessionDates:dates.length,first:dates[0],last:dates.at(-1),captured:results.length,failures,report:out||null}));
if(failures.length)process.exitCode=1;
