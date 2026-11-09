#!/usr/bin/env node
// Local/private, no account login, no token, no order path.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capturePreopenFiles,prospectiveCapturePlan } from '../research/nse-certification/upstox-prospective.mjs';

const session=process.argv[3];
const action=process.argv[2]??'plan';
if(!session||!/^\d{4}-\d{2}-\d{2}$/.test(session)||!['plan','capture'].includes(action)){
  console.error('Usage: node scripts/upstox_prospective_capture.mjs plan|capture YYYY-MM-DD');
  process.exitCode=2;
}else if(action==='plan'){
  console.log(JSON.stringify(prospectiveCapturePlan(session),null,2));
}else{
  try{
    const root=resolve(fileURLToPath(new URL('../data/local/upstox-prospective/',import.meta.url)));
    const result=await capturePreopenFiles({session,root,
      approved:process.env.ATLAS_UPSTOX_CAPTURE_APPROVED==='1'});
    // Never print raw market data, account credentials or auth tokens.
    console.log(JSON.stringify({session:result.session,status:'PRIVATE_RECEIPT_SAVED',
      folder:root,files:result.files.map(f=>({role:f.role,sha256:f.sha256})),
      certifiedHistoricalSessions:0},null,2));
  }catch(e){console.error('Capture refused:',e instanceof Error?e.message:'unknown error');process.exitCode=1;}
}
