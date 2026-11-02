import {execFileSync} from 'node:child_process';
import {COHORT_SYMBOLS} from '../src/upstox-history-cohort.js';
const token=execFileSync('security',['find-generic-password','-a','atlas-private-desk','-s','atlas-free-cloud-paper-owner','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
if(token.length<32)throw Error('owner token unavailable');
const base='https://atlas-free-cloud-paper.kuddosahib.workers.dev';
const day='2026-11-02',symbols=process.argv.includes('--smoke')?[COHORT_SYMBOLS[0]]:COHORT_SYMBOLS;
const results=[];
for(const symbol of symbols){
 const r=await fetch(base+'/api/cloud-paper/daily-cohort',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({source_date:day,symbol}),signal:AbortSignal.timeout(20000)});
 const body=await r.json();
 const x={symbol,http:r.status,status:body.status||null,error:body.error||null,diagnostic:body.diagnostic||null,bars:body.candle_count||null,last:body.last_day||null,hash:body.body_sha256||null,sourceHashes:body.source_receipts?.map(y=>({kind:y.kind,sha256:y.sha256,bytes:y.bytes}))||null,knownAt:body.known_at_utc||null};
 results.push(x);console.log(JSON.stringify(x));
 if(r.status!==200||!['CAPTURED','VERIFIED_EXISTING'].includes(body.status)||body.last_day!==day||body.candle_count<61||body.source_receipts?.length!==2)process.exit(1);
 if(symbol!==symbols.at(-1))await new Promise(resolve=>setTimeout(resolve,2200));
}
