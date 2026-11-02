import {execFileSync} from 'node:child_process';
const token=execFileSync('security',['find-generic-password','-a','atlas-private-desk','-s','atlas-free-cloud-paper-owner','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
if(token.length<32)throw Error('owner token unavailable');
const r=await fetch('https://atlas-free-cloud-paper.kuddosahib.workers.dev/api/cloud-paper/daily-cohort?day=2026-11-02',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
console.log(JSON.stringify({status:r.status,body:await r.json()}));
