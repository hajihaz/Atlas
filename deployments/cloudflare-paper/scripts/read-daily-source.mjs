import {execFileSync} from 'node:child_process';
const token=execFileSync('security',['find-generic-password','-a','atlas-private-desk','-s','atlas-free-cloud-paper-owner','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
if(token.length<32)throw Error('owner token unavailable');
const base='https://atlas-free-cloud-paper.kuddosahib.workers.dev';
for(const kind of ['historical','intraday']){
 const path='/api/cloud-paper/daily-source-check?'+new URLSearchParams({day:'2026-11-02',symbol:'AXISBANK',kind});
 const r=await fetch(base+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 console.log(JSON.stringify({kind,status:r.status,body:await r.json()}));
}
