// Fixed, read-only owner routes. No user path, credentials or broker actions.
import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import path from 'node:path';
import {ownerRequestAllowed} from './local-nse.js';

export async function privateOwnerJson(file,maxBytes=1500000){
 const dir=await lstat(path.dirname(file));
 if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)||dir.uid!==process.getuid())throw Error();
 const h=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const info=await h.stat();if(!info.isFile()||(info.mode&0o077)||info.uid!==process.getuid()||info.size>maxBytes)throw Error();
  const buffer=Buffer.alloc(maxBytes+1),{bytesRead}=await h.read(buffer,0,buffer.length,0);
  if(bytesRead>maxBytes)throw Error();return JSON.parse(buffer.subarray(0,bytesRead).toString('utf8'));
 }finally{await h.close();}
}
export async function handleOwnerStrategy(req,res,root,kind='strategy'){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json');
 const end=(status,value)=>{res.writeHead(status);res.end(JSON.stringify(value));};
 if(!ownerRequestAllowed(req)){end(403,{error:'owner_origin_required'});return;}
 if(req.method!=='GET'){res.setHeader('Allow','GET');end(405,{error:'method_not_allowed'});return;}
 const query=new URL(req.url,'http://127.0.0.1').searchParams;
 const date=query.get('date');
 const validDate=d=>/^20\d\d-\d\d-\d\d$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 if([...query.keys()].some(k=>k!=='date')||query.size>1||kind==='history'&&date||date&&!validDate(date)){
  end(400,{error:'invalid_owner_report_query'});return;
 }
 try{
  const folder=path.join(root,'.atlas-runtime');
  const directory=await lstat(folder);
  if(!directory.isDirectory()||directory.isSymbolicLink()||(directory.mode&0o077)||directory.uid!==process.getuid())throw Error();
  const file=kind==='history'?path.join(folder,'scalpstorm-history.json'):
    date?path.join(folder,'scalpstorm-days',date+'.json'):path.join(folder,'scalpstorm-owner.json');
  const data=await privateOwnerJson(file);
  const expected=kind==='history'?'atlas.scalpstorm-history.v1':'atlas.scalpstorm-owner-report.v1';
  if(data.schema!==expected||data.realOrdersEnabled!==false||data.actualCapitalINR!==0)throw Error();
  if(kind!=='history'&&(data.strategyId!=='scalpstorm_x_0940'||data.paperOnly!==true||data.ledgerVerified!==true||!Array.isArray(data.days)||!Array.isArray(data.positions)))throw Error();
  res.end(JSON.stringify(data));
 }catch{end(503,{error:kind==='history'?'owner_history_unavailable':'owner_strategy_unavailable'});}
}
