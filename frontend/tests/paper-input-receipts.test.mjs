import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {preparePaperInputReceipt,writePaperInputReceipt} from '../../scripts/paper_input_receipts.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
function input(){
 const H=3600000,now=Date.parse('2026-10-20T12:05:00Z'),closed=now-300000;
 const hourly=Array.from({length:120},(_,i)=>({time:closed-120*H+i*H,
  open:100+i,high:102+i,low:99+i,close:101+i,volume:2}));
 const bars=Array.from({length:60},(_,i)=>({time:hourly[i*2].time,
  open:hourly[i*2].open,high:hourly[i*2+1].high,low:hourly[i*2].low,
  close:hourly[i*2+1].close,volume:4}));
 const at=new Date(now).toISOString(),barAt=new Date(closed).toISOString();
 const quoteAt=new Date(now-1000).toISOString();
 return {previousSerialized:JSON.stringify({realOrdersEnabled:false}),
  candidateSerialized:JSON.stringify({mode:'SCHEDULED_VIRTUAL_PAPER',
   actualCapitalINR:0,realOrdersEnabled:false,status:'RUNNING',lastRunAt:at,lastBarClosedAt:barAt}),
  history:{source:'CoinDCX public INR spot candles',symbol:'BTCINR',currency:'INR',
   interval:'1h',candles:hourly},bars,
  quote:{symbol:'BTCINR',currency:'INR',price:221,sourceAt:quoteAt},
  diagnostic:{status:'PASS',code:'ELIGIBLE',checkedAt:at,
   latestBarClosedAt:barAt,providerQuoteAt:quoteAt},now,
  codeHashes:Object.fromEntries(['strategy','paperEngine','decisionEvidence','receiptWriter']
   .map(key=>[key,hash(key)]))};
}
test('private receipt binds exact normalized inputs and exact prior/candidate snapshot bytes',()=>{
 const value=input(),before=structuredClone(value),result=preparePaperInputReceipt(value);
 const receipt=JSON.parse(result.serialized);
 assert.deepEqual(receipt.inputs.bars,value.bars);
 assert.deepEqual(receipt.inputs.history,value.history);
 assert.deepEqual(receipt.inputs.quote,value.quote);
 assert.equal(receipt.previousSnapshotSha256,hash(value.previousSerialized));
 assert.equal(receipt.candidateSnapshotSha256,hash(value.candidateSerialized));
 assert.equal(result.sha256,hash(result.serialized));
 assert.equal(receipt.candidateOnly,true);
 assert.equal(receipt.ledgerCommitIndependentlyRequired,true);
 assert.deepEqual(value,before,'capture must never mutate candidate or source');
 const changed=structuredClone(value);changed.bars.at(-1).volume+=1;
 assert.notEqual(preparePaperInputReceipt(changed).sha256,result.sha256);
});
test('unverified source, candle mismatch and enabled real orders cannot acquire a receipt',()=>{
 for(const mutate of [
  v=>{v.diagnostic.status='BLOCKED';},
  v=>{v.bars.at(-1).time-=7200000;},
  v=>{v.quote.sourceAt='2026-10-20T11:00:00Z';},
  v=>{v.bars.at(-1).close=Number.NaN;},
  v=>{v.candidateSerialized=v.candidateSerialized.replace('"realOrdersEnabled":false','"realOrdersEnabled":true');},
 ]){
  const v=input();mutate(v);
  assert.throws(()=>preparePaperInputReceipt(v));
 }
});
test('capture is private, idempotent and refuses immutable-file tampering',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'atlas-input-receipt-'));
 try{
  const v=input(),first=await writePaperInputReceipt(dir,v);
  assert.equal((await stat(dir)).mode&0o777,0o700);
  const target=path.join(dir,first.name);
  assert.equal((await stat(target)).mode&0o777,0o600);
  assert.equal(first.public,false);
  assert.equal(first.sha256,hash(await readFile(target,'utf8')));
  assert.deepEqual(await writePaperInputReceipt(dir,v),first);
  assert.equal((await readdir(dir)).length,1);
  await writeFile(target,'tampered\n');
  await assert.rejects(writePaperInputReceipt(dir,v),/collision or tampering/);
  assert.equal(await readFile(target,'utf8'),'tampered\n');
  assert.deepEqual(await readdir(dir),[first.name]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('a receipt directory symlink cannot write into another directory',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'atlas-input-link-'));
 try{
  const target=path.join(root,'target'),link=path.join(root,'receipts');
  await mkdir(target);await symlink(target,link,'dir');
  await assert.rejects(writePaperInputReceipt(link,input()),/Unsafe private receipt/);
  assert.deepEqual(await readdir(target),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});
