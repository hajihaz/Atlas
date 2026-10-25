// Owner-only normalized source receipts. Never creates a signal or fills an account.
// Captures the exact objects supplied to the paper engine, not raw exchange packets.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {validateResearchBars} from '../frontend/lib/research-engine.js';
const TWO_HOURS=7200000,MAX_BYTES=240000,MAX_RECEIPTS=512;
const sha=value=>createHash('sha256').update(value).digest('hex');
const encode=value=>JSON.stringify(value,null,2)+'\n';
const digestKeys=['strategy','paperEngine','decisionEvidence','receiptWriter'];
export function preparePaperInputReceipt({
 previousSerialized,candidateSerialized,history,bars,quote,diagnostic,now,codeHashes,
}){
 if(typeof previousSerialized!=='string'||typeof candidateSerialized!=='string'||
  !Number.isSafeInteger(now)||now<=0)throw Error('Invalid receipt binding');
 const previous=JSON.parse(previousSerialized),candidate=JSON.parse(candidateSerialized);
 if(previous.realOrdersEnabled!==false||candidate.realOrdersEnabled!==false||
  candidate.actualCapitalINR!==0||candidate.mode!=='SCHEDULED_VIRTUAL_PAPER'||
  !['RUNNING','GAP_SKIPPED'].includes(candidate.status)||
  candidate.lastRunAt!==new Date(now).toISOString()||
  diagnostic?.status!=='PASS'||diagnostic.code!=='ELIGIBLE'||
  diagnostic.checkedAt!==candidate.lastRunAt||
  diagnostic.latestBarClosedAt!==candidate.lastBarClosedAt||
  history?.source!=='CoinDCX public INR spot candles'||history.symbol!=='BTCINR'||
  history.currency!=='INR'||history.interval!=='1h'||
  !Array.isArray(history.candles)||history.candles.length>180||
  !Array.isArray(bars)||bars.length<55||bars.length>90||
  bars.at(-1).time+TWO_HOURS!==Date.parse(candidate.lastBarClosedAt)||
  quote?.symbol!=='BTCINR'||quote.currency!=='INR'||
  !Number.isFinite(quote.price)||quote.price<=0||
  quote.sourceAt!==diagnostic.providerQuoteAt||
  !codeHashes||Object.keys(codeHashes).length!==digestKeys.length||
  !digestKeys.every(key=>/^[a-f0-9]{64}$/.test(codeHashes[key]??'')))
  throw Error('Cannot bind an unverified paper source receipt');
 validateResearchBars(history.candles,3600000);
 validateResearchBars(bars,TWO_HOURS);
 const receipt={schema:1,mode:'OWNER_PRIVATE_NORMALIZED_INPUT_CAPTURE',
  capturedAt:candidate.lastRunAt,completedBarAt:candidate.lastBarClosedAt,
  previousSnapshotSha256:sha(previousSerialized),
  candidateSnapshotSha256:sha(candidateSerialized),codeHashes,
  candidateOnly:true,ledgerCommitIndependentlyRequired:true,
  inputs:{history,bars,quote,diagnostic},
  realOrdersEnabled:false,actualCapitalINR:0,
  limitation:'Normalized provider inputs observed at capturedAt. A matching committed ledger hash is required; this is not a raw packet, exchange execution or historical receipt.'};
 const serialized=encode(receipt);
 if(Buffer.byteLength(serialized,'utf8')>MAX_BYTES)throw Error('Private input receipt exceeds bound');
 return {serialized,sha256:sha(serialized),name:now+'-'+sha(candidateSerialized)+'.json'};
}
export async function writePaperInputReceipt(directory,input){
 const prepared=preparePaperInputReceipt(input);
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 const stat=await fs.lstat(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Unsafe private receipt directory');
 await fs.chmod(directory,0o700);
 const file=path.join(directory,prepared.name);
 const temporary=path.join(directory,'.pending-'+randomUUID());
 try{
  const handle=await fs.open(temporary,'wx',0o600);
  try{await handle.writeFile(prepared.serialized,'utf8');await handle.sync();}
  finally{await handle.close();}
  try{await fs.link(temporary,file);}
  catch(error){
   if(error.code!=='EEXIST')throw error;
   const existing=await fs.lstat(file);
   if(!existing.isFile()||existing.isSymbolicLink()||
    await fs.readFile(file,'utf8')!==prepared.serialized)
    throw Error('Immutable receipt collision or tampering');
  }
 }finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
 // 512 two-hour captures retain roughly six weeks. Never touches paper accounts.
 const names=(await fs.readdir(directory)).filter(name=>
  /^\d{13}-[a-f0-9]{64}\.json$/.test(name)).sort();
 for(const old of names.slice(0,Math.max(0,names.length-MAX_RECEIPTS)))
  await fs.unlink(path.join(directory,old));
 return {name:prepared.name,sha256:prepared.sha256,retentionLimit:MAX_RECEIPTS,
  public:false,normalizedInputOnly:true};
}
