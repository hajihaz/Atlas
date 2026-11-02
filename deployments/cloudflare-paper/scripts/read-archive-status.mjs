import {execFileSync} from 'node:child_process';
const token=execFileSync('security',['find-generic-password','-a','atlas-private-desk','-s','atlas-free-cloud-paper-owner','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
if(token.length<32)throw Error('owner token unavailable');
const base='https://atlas-free-cloud-paper.kuddosahib.workers.dev';
for(const path of ['/api/cloud-paper/nse-reference?day=2026-10-30&kind=eod','/api/cloud-paper/nse-reference?day=2026-10-30&kind=master','/api/cloud-paper/history-cohort?day=2026-10-30','/api/cloud-paper/seven-accounts']){
 const r=await fetch(base+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 const body=await r.json();console.log(JSON.stringify({path,status:r.status,body}));
}
