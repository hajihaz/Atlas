#!/usr/bin/env node
// Owner-local, unauthenticated public reference observer. Never reads or writes a paper ledger.
import {mkdir,lstat,writeFile,rename,unlink} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {KRAKEN_ASSETS,startKrakenStream} from '../frontend/src/lib/krakenStream.js';
const STATE=fileURLToPath(new URL('../.atlas-runtime/',import.meta.url));

export function streamHealth({quotes={},status='CONNECTING',lastReceivedAt=null,now=Date.now()}={}){
 const observed=KRAKEN_ASSETS.map(symbol=>{
  const quote=quotes[symbol],at=Date.parse(quote?.sourceAt??'');
  const fresh=!!quote&&Number.isFinite(quote.price)&&quote.price>0&&Number.isFinite(at)&&now-at>= -5000&&now-at<=90000;
  return {symbol,currency:'USD',price:fresh?quote.price:null,sourceAt:quote?.sourceAt??null,
   tradeId:quote?.tradeId??null,fresh,ageSeconds:Number.isFinite(at)?Math.max(0,Math.floor((now-at)/1000)):null};
 });
 const freshSymbols=observed.filter(q=>q.fresh).map(q=>q.symbol);
 return {schema:'atlas.public-crypto-observer.v1',mode:'PUBLIC_REFERENCE_ONLY',
  provider:'Kraken public v2 trades',currency:'USD',checkedAt:new Date(now).toISOString(),
  lastReceivedAt,status:status==='STREAMING'&&!freshSymbols.length?'SOURCE_STALE':status,
  freshSymbols,quotes:observed,realOrdersEnabled:false,paperExecutionEnabled:false,
  note:'Source timestamps change only on actual provider trades. USD references never enter INR accounts.'};
}
export async function saveStreamHealth(state,directory=STATE){
 await mkdir(directory,{recursive:true,mode:0o700});
 if((await lstat(directory)).isSymbolicLink())throw Error('Unsafe stream state directory');
 const destination=resolve(directory,'public-stream.json');
 try{if((await lstat(destination)).isSymbolicLink())throw Error('Unsafe stream state file');}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const temporary=resolve(directory,'.public-stream-'+randomBytes(12).toString('hex')+'.tmp');
 try{await writeFile(temporary,JSON.stringify(state)+'\n',{mode:0o600,flag:'wx'});await rename(temporary,destination);}
 finally{await unlink(temporary).catch(()=>{});}
}
export function runPublicObserver(){
 const state={quotes:{},status:'CONNECTING',lastReceivedAt:null};
 let writing=Promise.resolve(),stopping=false,failure=false,busy=false;
 const flush=()=>{
  if(busy)return writing;
  busy=true;
  writing=saveStreamHealth(streamHealth(state)).catch(()=>{
   if(!failure){failure=true;console.error('Public reference observer state write failed');void stop();}
  }).finally(()=>{busy=false;});
  return writing;
 };
 const stopStream=startKrakenStream({
  onQuote:quote=>{state.quotes[quote.symbol]=quote;state.lastReceivedAt=new Date().toISOString();},
  onStatus:status=>{state.status=status;},
 });
 void flush();
 const timer=setInterval(()=>void flush(),1000);
 async function stop(){
  if(stopping)return;
  stopping=true;clearInterval(timer);stopStream();state.status='STOPPED';
  await writing;await flush();process.exitCode=failure?1:0;
 }
 process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
 return stop;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runPublicObserver();
