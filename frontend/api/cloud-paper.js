// Live paper snapshots from a PRIVATE repository without exposing its token to browsers.
// This endpoint is inert until a read-only Contents token is installed server-side.
// It is a fixed-path GET-only mirror of already-public virtual research ledger data,
// not an order / trading endpoint. Never include source, auth, or upstream errors in responses.
import {buildCloudPaperSummary} from '../src/lib/cloudPaperDaybook.js';
import {configuredArtifactRef,RUNTIME_DATA_REF} from '../src/lib/privateArtifact.js';
const SOURCE='https://api.github.com/repos/hajihaz/Atlas/contents/frontend/public/cloud-paper.json?ref=';
export const APPROVED_PREVIEW_REF='haor/atlas-runtime-completion-20261024';
const MAX_BYTES=140_000;
export function validatePrivateCloudSnapshot(x,now=Date.now()){
 if(!x||typeof x!=='object'||Array.isArray(x)||x.schema!==1||
    x.mode!=='SCHEDULED_VIRTUAL_PAPER'||x.symbol!=='BTCINR'||x.currency!=='INR'||
    x.realOrdersEnabled!==false||x.actualCapitalINR!==0||
    !Number.isSafeInteger(x.runCount)||x.runCount<0||x.runCount>10_000_000||
    !Array.isArray(x.sessions)||![0,5].includes(x.sessions.length)||
    typeof x.lastRunAt!=='string'||!Number.isFinite(Date.parse(x.lastRunAt))||
    Date.parse(x.lastRunAt)>now+30_000)
  throw Error('invalid_paper_snapshot');
 if(x.sessions.some(s=>!s||!Number.isFinite(s.virtualEquityINR)||
    !Number.isFinite(s.cashINR)||s.cashINR<0||
    !Array.isArray(s.events)||s.events.length>120||
    s.events.some(e=>!e||!['BUY','SELL'].includes(e.side)||
      !Number.isFinite(e.modeledPriceINR)||e.modeledPriceINR<=0||
      !Number.isFinite(e.quantity)||e.quantity<=0)))
  throw Error('invalid_paper_snapshot');
 if(x.recentCheckpoints!==undefined){
  const points=x.recentCheckpoints;
  if(!Array.isArray(points)||points.length>24||
     points.some(p=>!Number.isSafeInteger(p?.runCount)||
       p?.realOrdersEnabled!==false||p?.actualCapitalINR!==0||
       !Number.isSafeInteger(p?.newModeledFills)||p.newModeledFills<0))
   throw Error('invalid_paper_snapshot');
  if(points.length&&
    (points.at(-1).runCount!==x.runCount||points.at(-1).at!==x.lastRunAt))
   throw Error('invalid_paper_snapshot');
 }
 // Match the browser's full source/ledger provenance and accounting guard.
 // Syntactically valid JSON with inconsistent modeled evidence is not trusted.
 try{buildCloudPaperSummary(x)}catch{throw Error('invalid_paper_snapshot')}
 return x;
}
export async function getPrivateCloudSnapshot({
 token,fetcher=fetch,now=Date.now(),timeoutMs=6000,ref='main',
}={}){
 if(typeof token!=='string'||token.trim().length<20)
  throw Error('private_paper_source_not_configured');
 if(!['main',APPROVED_PREVIEW_REF,RUNTIME_DATA_REF].includes(ref))throw Error('invalid_paper_source_ref');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetcher(SOURCE+encodeURIComponent(ref),{method:'GET',redirect:'error',
   signal:controller.signal,
   headers:{
    Accept:'application/vnd.github.raw+json',
    Authorization:'Bearer '+token,
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'Atlas-Public-Virtual-Ledger-ReadOnly',
   }});
  if(!response.ok||Number(response.headers?.get?.('content-length')||0)>MAX_BYTES)
   throw Error('private_paper_source_unavailable');
  const body=await response.text();
  if(body.length>MAX_BYTES)throw Error('private_paper_source_unavailable');
  return validatePrivateCloudSnapshot(JSON.parse(body),now);
 }finally{clearTimeout(timer);}
}
// Retired endpoint: keep pure archival validators callable offline, but block public delivery.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  return res.status(405).json({error:'method_not_allowed'});
 }
 return res.status(410).json({error:'strategy_retired',activeStrategyId:'scalpstorm_x_0940'});
}
