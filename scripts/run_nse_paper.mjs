// Owner-only file consumer. This process never reads credentials or calls a broker.
import {constants} from 'node:fs';
import fs from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {withPrivateLock} from '../frontend/private-lock.js';
import {NsePaperStore} from './nse_paper_store.mjs';
export async function readPrivateJson(file,maxBytes=1500000){
  const dir=await fs.lstat(resolve(file,'..'));
  if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)||dir.uid!==process.getuid())throw Error('Private NSE directory required');
  const handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const info=await handle.stat();
    if(!info.isFile()||(info.mode&0o077)||info.uid!==process.getuid()||info.size>maxBytes)throw Error('Private NSE input required');
    const buffer=Buffer.alloc(maxBytes+1),{bytesRead}=await handle.read(buffer,0,buffer.length,0);
    if(bytesRead>maxBytes)throw Error('Oversized NSE input');
    return JSON.parse(buffer.subarray(0,bytesRead).toString('utf8'));
  }finally{await handle.close();}
}
export async function writePrivateJson(file,value){
  const folder=resolve(file,'..');
  await fs.mkdir(folder,{recursive:true,mode:0o700});
  const info=await fs.lstat(folder);
  if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)||info.uid!==process.getuid())throw Error('Private NSE output required');
  try{const dest=await fs.lstat(file);if(!dest.isFile()||dest.isSymbolicLink()||(dest.mode&0o077))throw Error('Unsafe NSE output');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  const tmp=file+'.'+randomUUID()+'.tmp';
  try{
    const handle=await fs.open(tmp,'wx',0o600);
    try{await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();}finally{await handle.close();}
    await fs.rename(tmp,file);
  }finally{await fs.rm(tmp,{force:true});}
}
export async function runNsePaper(directory,{once=false}={}){
  process.umask(0o077);
  directory=resolve(directory);
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const universe=await readPrivateJson(join(directory,'nse-pilot-universe.json'),32768);
  return withPrivateLock(join(directory,'nse-paper-worker'),async()=>{
    const store=new NsePaperStore(join(directory,'nse-paper.sqlite3'),{universe:universe.instruments});
    let stopping=false,seen=0,lastReport=null;
    const stop=()=>{stopping=true;};
    process.once('SIGTERM',stop);process.once('SIGINT',stop);
    try{
      do{
        const now=Date.now();
        try{
          const input=await readPrivateJson(join(directory,'nse-paper-input.json'));
          const inputTime=Date.parse(input.observedAt);
          if(inputTime>seen){
            store.advance(input,now);seen=inputTime;
          }else if(!Number.isFinite(inputTime)||now-inputTime>90000)throw Error('NSE source stale');
          lastReport=store.report(now);
        }catch{
          // Never reflect paths, raw provider errors or file contents into the UI/log.
          const preserved=store.report(now);
          lastReport={...preserved,status:'SOURCE_UNAVAILABLE',
            note:'Source input unavailable; existing cash, positions and event history preserved.'};
        }
        await writePrivateJson(join(directory,'nse-paper.json'),lastReport);
        if(once)break;
        await new Promise(resolve=>setTimeout(resolve,2000));
      }while(!stopping);
    }finally{store.close();process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
    return lastReport;
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length<3||process.argv.length>4||process.argv[3]&&process.argv[3]!=='--once')
    throw Error('Usage: run_nse_paper.mjs PRIVATE_STATE_DIRECTORY [--once]');
  await runNsePaper(process.argv[2],{once:process.argv[3]==='--once'});
}
