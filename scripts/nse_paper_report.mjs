// The same private accounting report is used by ChatGPT/HHC and the owner Mac API.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NsePaperStore} from './nse_paper_store.mjs';
import {STRATEGIES} from '../frontend/lib/research-engine.js';
export function readNsePaperReport(file,query={}){
  if(query.strategy&&!STRATEGIES.some(s=>s.id===query.strategy))throw Error('Unknown NSE strategy');
  if(query.date&&(!/^\d{4}-\d\d-\d\d$/.test(query.date)||
    new Date(query.date+'T00:00:00Z').toISOString().slice(0,10)!==query.date))throw Error('Invalid NSE day');
  if(query.offset!==undefined&&(!Number.isSafeInteger(query.offset)||query.offset<0||query.offset>1000000))
    throw Error('Invalid NSE offset');
  const store=new NsePaperStore(file,{readOnly:true});
  try{return store.report(Date.now(),query);}finally{store.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(![3,5,6].includes(process.argv.length))throw Error('Invalid report arguments');
    const query=process.argv[3]?{strategy:process.argv[3],date:process.argv[4],offset:Number(process.argv[5]??0)}:{};
    console.log(JSON.stringify(readNsePaperReport(process.argv[2],query)));
  }catch{console.error('Private NSE accounting unavailable or failed verification');process.exitCode=2;}
}
