// Prospective, private and read-only Upstox instrument receipts. This does not
// create a ScalpStorm universe, request an order, or authenticate an account.
import { createHash } from 'node:crypto';
import { mkdir, lstat, writeFile } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { json } from './normalize.mjs';

export const INSTRUMENT_FILES=Object.freeze({
  bod:Object.freeze({url:'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz',file:'nse-bod.json.gz'}),
  mis:Object.freeze({url:'https://assets.upstox.com/market-quote/instruments/exchange/NSE_MIS.json.gz',file:'nse-mis.json.gz'}),
  suspended:Object.freeze({url:'https://assets.upstox.com/market-quote/instruments/exchange/suspended-instrument.json.gz',file:'suspended.json.gz'}),
});
const MAX_COMPRESSED=32*1024*1024;
const MAX_UNCOMPRESSED=128*1024*1024;


async function limitedBody(response){
  const declared=response.headers?.get('content-length');
  if(declared!==null&&declared!==undefined){
    if(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))
        ||Number(declared)>MAX_COMPRESSED)throw Error('Invalid or oversized content length');
  }
  const reader=response.body?.getReader?.();
  if(!reader)throw Error('A bounded readable response body is required');
  const chunks=[];let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      if(!(value instanceof Uint8Array))throw Error('Invalid body chunk');
      total+=value.byteLength;
      if(total>MAX_COMPRESSED)throw Error('Instrument file too large');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks,total);
  }catch(error){
    try{await reader.cancel();}catch{/* retain original acquisition failure */}
    throw error;
  }finally{reader.releaseLock();}
}

function validDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)
      ||Number.isNaN(Date.parse(value+'T00:00:00Z'))
      ||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)
    throw Error('A real YYYY-MM-DD session date is required');
  return value;
}
function istDate(instant){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',
    year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
  const take=type=>parts.find(p=>p.type===type)?.value;
  return `${take('year')}-${take('month')}-${take('day')}`;
}
function preopen(session,instant){
  validDate(session);
  if(!Number.isFinite(instant)||istDate(instant)!==session)throw Error('Only the current IST date can be captured prospectively');
  const day=new Date(session+'T12:00:00+05:30').getUTCDay();
  if(day===0||day===6)throw Error('Capture requires a weekday; exchange holidays still need independent review');
  if(instant<Date.parse(session+'T06:30:00+05:30')||instant>=Date.parse(session+'T09:15:00+05:30'))
    throw Error('Only the 06:30–09:15 IST pre-open window is accepted');
}

export function historicalCandleUrl({instrumentKey,fromDate,toDate}){
  if(typeof instrumentKey!=='string'||!/^NSE_EQ\|INE[A-Z0-9]{9}$/.test(instrumentKey))
    throw Error('Only a stable NSE equity ISIN instrument key is allowed');
  validDate(fromDate);validDate(toDate);
  const span=(Date.parse(toDate+'T00:00:00Z')-Date.parse(fromDate+'T00:00:00Z'))/86400000;
  if(!Number.isInteger(span)||span<0||span>27)throw Error('Use at most 28 inclusive calendar days per one-minute request');
  // URL builder only. Callers must obtain an owner-held read-only Analytics Token
  // after account/rights approval; back-adjusted history never proves old BOD.
  return `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrumentKey)}/minutes/1/${toDate}/${fromDate}`;
}

export function prospectiveCapturePlan(session,instant=Date.now()){
  validDate(session);
  return {schema:'atlas.upstox-prospective-plan.v1',session,
    captureStatus:'OWNER_APPROVAL_PENDING',requestsSent:0,realOrdersEnabled:false,
    certifiedHistoricalSessions:0,additionalApiSpendINR:0,
    sources:Object.fromEntries(Object.entries(INSTRUMENT_FILES).map(([k,v])=>[k,v.url])),
    earliestCaptureIST:'06:30',latestCaptureExclusiveIST:'09:15',
    currentISTDate:istDate(instant),
    caveat:'A dated receipt is not independent publication, rights, identity, actions or full-minute coverage evidence. Never relabel this BOD as a prior session.'};
}

export async function capturePreopenFiles({session,approved=false,now=Date.now,
  fetcher=fetch,root}){
  // Caller confirmation represents reviewed account/data rights, not merely
  // technical reachability. The CLI requires a separate explicit environment gate.
  if(approved!==true)throw Error('Owner approval and intended-use rights are required before any data request');
  if(typeof root!=='string'||!isAbsolute(root))throw Error('An absolute private output root is required');
  preopen(session,now());
  try{
    const info=await lstat(root);
    if(info.isSymbolicLink()||!info.isDirectory())throw Error('Private output root must be a real directory, not a symlink');
  }catch(error){if(error?.code!=='ENOENT')throw error;}
  const target=join(root,session);
  try{await lstat(target);throw Error('Prospective evidence already exists for this session; refusing overwrite');}
  catch(e){if(e?.code!=='ENOENT')throw e;}
  const acquired=[];
  for(const [role,source] of Object.entries(INSTRUMENT_FILES)){
    const requestedMs=now();preopen(session,requestedMs);
    // Fixed HTTPS asset host, no credentials, redirects or mutation methods.
    const response=await fetcher(source.url,{method:'GET',redirect:'error',
      headers:{accept:'application/gzip'},signal:AbortSignal.timeout(8000)});
    if(!response?.ok||response.url!==source.url)throw Error(`Upstox ${role} source unavailable or redirected`);
    const bytes=await limitedBody(response);
    const receivedMs=now();
    if(receivedMs<requestedMs)throw Error('Capture clock moved backward');
    preopen(session,receivedMs);
    const requestedAt=new Date(requestedMs).toISOString();
    const receivedAt=new Date(receivedMs).toISOString();
    if(bytes.length===0||bytes.length>MAX_COMPRESSED||bytes[0]!==0x1f||bytes[1]!==0x8b)
      throw Error(`Invalid or oversized ${role} gzip`);
    const rows=json(gunzipSync(bytes,{maxOutputLength:MAX_UNCOMPRESSED}));
    if(!Array.isArray(rows)||(role!=='suspended'&&rows.length===0))throw Error(`Invalid ${role} instrument list`);
    const modified=response.headers?.get('last-modified');
    const modifiedMs=modified?Date.parse(modified):NaN;
    const sourceLastModifiedAt=Number.isFinite(modifiedMs)&&modifiedMs<=Date.parse(receivedAt)
      ?new Date(modifiedMs).toISOString():null;
    acquired.push({role,path:source.file,sourceUrl:source.url,bytes,
      requestedAt,receivedAt,sourceLastModifiedAt,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  const completedAt=now();preopen(session,completedAt);
  await mkdir(root,{recursive:true,mode:0o700});
  if((await lstat(root)).isSymbolicLink())throw Error('Private output root must not be a symlink');
  await mkdir(target,{mode:0o700}); // atomic duplicate-session gate
  const manifest={schema:'atlas.upstox-prospective-receipts.v1',session,
    capturedAt:new Date(completedAt).toISOString(),mode:'PRIVATE_READ_ONLY_PREOPEN_RECEIPT',
    certifiedHistoricalSessions:0,fullUniverseVerified:false,
    publicationIndependentlyVerified:false,rightsIndependentlyVerified:false,
    priceBasis:'UNKNOWN',paperOrdersExecuted:false,realOrdersEnabled:false,
    files:acquired.map(({role,path,sourceUrl,requestedAt,receivedAt,sourceLastModifiedAt,sha256,bytes})=>({
      role,path,sourceUrl,requestedAt,receivedAt,sourceLastModifiedAt,sha256,byteLength:bytes.length,
      sameSessionSourceModification:sourceLastModifiedAt!==null&&istDate(Date.parse(sourceLastModifiedAt))===session,
    })),
    warning:'Current-day broker BOD/MIS/suspended receipts only. Exchange holiday, full eligibility, ISIN-series identity, corporate actions, original one-minute OHLCV, publication evidence and data rights still require independent review. Not September/October historical evidence.',
  };
  for(const file of acquired)await writeFile(join(target,file.path),file.bytes,{flag:'wx',mode:0o600});
  await writeFile(join(target,'receipt.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  return manifest;
}
