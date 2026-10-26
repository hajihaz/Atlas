import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const CODE_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const validDay=d=>/^\d{4}-\d\d-\d\d$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
import {ownerRequestAllowed} from './local-nse.js';
import {validateNsePaperReport} from './src/lib/nsePaperReport.js';
const exec=promisify(execFile);
async function readSnapshot(file){
  const dir=await lstat(path.dirname(file));
  if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)||dir.uid!==process.getuid())throw Error();
  const h=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const s=await h.stat();
    if(!s.isFile()||(s.mode&0o077)||s.uid!==process.getuid()||s.size>1500000)throw Error();
    const b=Buffer.alloc(1500001),{bytesRead}=await h.read(b,0,b.length,0);
    if(bytesRead>1500000)throw Error();
    return JSON.parse(b.subarray(0,bytesRead).toString('utf8'));
  }finally{await h.close();}
}
export async function handleNsePaper(request,response,ownerRoot){
  response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Content-Type','application/json; charset=utf-8');
  const end=(status,value)=>{response.writeHead(status);response.end(JSON.stringify(value));};
  if(!ownerRequestAllowed(request)){end(403,{error:'owner_origin_required'});return;}
  if(request.method!=='GET'){response.setHeader('Allow','GET');end(405,{error:'method_not_allowed'});return;}
  const query=new URL(request.url,'http://127.0.0.1').searchParams;
  const mode=query.get('mode')??'forward',strategy=query.get('strategy'),date=query.get('date');
  if([...query.keys()].some(k=>!['mode','strategy','date','offset'].includes(k))||
    [...new Set(query.keys())].some(k=>query.getAll(k).length!==1)||
    !['forward','historical'].includes(mode)||!!strategy!==!!date||
    strategy&&!['sma_9_21','ema_12_26','rsi_14','breakout_20','sps_pullback'].includes(strategy)||
    date&&!validDay(date)||
    query.has('offset')&&(!strategy||!/^\d{1,7}$/.test(query.get('offset'))||Number(query.get('offset'))>1000000)){
    end(400,{error:'invalid_nse_report_query'});return;
  }
  try{
    const folder=path.join(ownerRoot,'.atlas-runtime');
    const expected=mode==='forward'?'FORWARD':'HISTORICAL_REPLAY';
    let data;
    if(strategy&&mode==='historical'){
      data=await readSnapshot(path.join(folder,'nse-history-days',strategy+'_'+date+'_'+(query.get('offset')??'0')+'.json'));
    }else if(strategy){
      const file=path.join(folder,'nse-paper.sqlite3');
      const result=await exec(process.execPath,[path.join(CODE_ROOT,'scripts/nse_paper_report.mjs'),
        file,strategy,date,query.get('offset')??'0'],{cwd:CODE_ROOT,timeout:10000,maxBuffer:1500000,
        env:{PATH:process.env.PATH,NODE_NO_WARNINGS:'1'}});
      data=JSON.parse(result.stdout);
    }else{
      data=await readSnapshot(path.join(folder,mode==='forward'?'nse-paper.json':'nse-history-report.json'));
    }
    const safe=validateNsePaperReport(data,Date.now(),expected);
    response.end(JSON.stringify(safe));
  }catch{end(503,{error:'private_nse_accounting_unavailable'});}
}
