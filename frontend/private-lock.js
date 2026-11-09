// Private owner-store mutex. Publish only a prepared, nonempty lease directory.
// Exact marker names let orphan recovery remove only the lease it inspected.
import {randomBytes} from 'node:crypto';
import {mkdir,lstat,writeFile,readFile,readdir,rename,unlink,rmdir} from 'node:fs/promises';
import {join} from 'node:path';

const BUSY=new Set(['EEXIST','ENOTEMPTY','ENOTDIR']);
async function removeEmpty(path){
 try{await rmdir(path);}
 catch(e){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))throw e;}
}
async function recoverOrphan(lock){
 let info;
 try{info=await lstat(lock);}catch(e){if(e.code==='ENOENT')return;throw e;}
 if(info.isSymbolicLink()||!info.isDirectory())
  throw Error('Legacy or unsafe push lock requires controlled migration');
 const names=await readdir(lock);
 if(names.length===0)return;
 if(names.length!==1||!/^owner-[a-f0-9]{36}\.json$/.test(names[0]))
  throw Error('Push operation already active');
 const marker=join(lock,names[0]);
 let metadata;
 try{
  const file=await lstat(marker);
  if(file.isSymbolicLink()||!file.isFile()||file.size>512)throw Error('Unsafe push lease');
  metadata=JSON.parse(await readFile(marker,'utf8'));
 }catch(e){if(e.code==='ENOENT')return;throw e;}
 if(!Number.isSafeInteger(metadata.pid)||metadata.pid<=1||
    !Number.isFinite(metadata.at)||Date.now()-metadata.at<=30000)
  throw Error('Push operation already active');
 try{process.kill(metadata.pid,0);throw Error('Push operation already active');}
 catch(e){if(e.code!=='ESRCH')throw e;}
 // If another recoverer already removed this exact marker, do not touch its successor.
 try{await unlink(marker);}catch(e){if(e.code==='ENOENT')return;throw e;}
 // A successor can atomically replace an empty lease; rmdir cannot remove it once nonempty.
 await removeEmpty(lock);
}

export async function withPrivateLock(dir,action){
 await mkdir(dir,{recursive:true,mode:0o700});
 const info=await lstat(dir);
 if(info.isSymbolicLink()||!info.isDirectory())throw Error('Unsafe private push directory');
 const token=randomBytes(18).toString('hex');
 const candidate=join(dir,'.operation-'+token);
 const marker='owner-'+token+'.json';
 const lock=join(dir,'operation.lock');
 await mkdir(candidate,{mode:0o700});
 let held=false;
 try{
  await writeFile(join(candidate,marker),JSON.stringify({pid:process.pid,at:Date.now()}),
   {flag:'wx',mode:0o600});
  try{await rename(candidate,lock);held=true;}
  catch(e){
   if(!BUSY.has(e.code))throw e;
   await recoverOrphan(lock);
   try{await rename(candidate,lock);held=true;}
   catch(e){if(BUSY.has(e.code))throw Error('Push operation already active');throw e;}
  }
  return await action();
 }finally{
  const owned=held?lock:candidate;
  // Never unlink a shared pathname. The unpredictable marker belongs only to this lease.
  try{await unlink(join(owned,marker));}
  catch(e){if(e.code!=='ENOENT')throw e;}
  await removeEmpty(owned);
 }
}
