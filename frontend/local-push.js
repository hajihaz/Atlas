// Owner-local push subscriptions and delivery. Never imported by the browser bundle.
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,unlink,lstat,open} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import webpush from 'web-push';
import {browserDeadlineCandidates,feedAgeMinutes,validFeed,indiaToday} from './src/lib/ipoIntelligence.ts';
export const DEFAULT_PUSH_DIRECTORY=resolve(dirname(fileURLToPath(import.meta.url)),'../.atlas-runtime/push');
const PUSH_HOSTS=['fcm.googleapis.com','web.push.apple.com','updates.push.services.mozilla.com'];
export function validateSubscription(raw){
 if(!raw||typeof raw.endpoint!=='string'||raw.endpoint.length>4096||/[\s\u0000-\u001f]/.test(raw.endpoint))throw Error('Invalid push subscription');
 const u=new URL(raw.endpoint);
 if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443'||
    !PUSH_HOSTS.some(h=>u.hostname===h||h==='updates.push.services.mozilla.com'&&u.hostname.endsWith('.push.services.mozilla.com')))throw Error('Unsupported push endpoint');
 const keys=raw.keys;
 if(!keys||typeof keys.p256dh!=='string'||typeof keys.auth!=='string'||
   !/^[A-Za-z0-9_-]+$/.test(keys.p256dh)||!/^[A-Za-z0-9_-]+$/.test(keys.auth)||
   Buffer.from(keys.p256dh,'base64url').length!==65||Buffer.from(keys.auth,'base64url').length!==16)throw Error('Invalid push keys');
 return {endpoint:u.href,keys:{p256dh:keys.p256dh,auth:keys.auth}};
}
async function directory(path){
 await mkdir(path,{recursive:true,mode:0o700});
 if((await lstat(path)).isSymbolicLink())throw Error('Unsafe private push directory');
}
async function read(path,fallback){
 try{if((await lstat(path)).isSymbolicLink())throw Error('Unsafe push file');return JSON.parse(await readFile(path,'utf8'));}
 catch(e){if(e.code==='ENOENT')return fallback;throw e;}
}
async function atomic(path,value){
 const tmp=path+'.'+randomBytes(8).toString('hex')+'.tmp';
 try{await writeFile(tmp,JSON.stringify(value),{mode:0o600,flag:'wx'});await rename(tmp,path);}
 finally{await unlink(tmp).catch(()=>{});}
}
async function locked(dir,action){
 await directory(dir);
 const lock=join(dir,'operation.lock');let fd;
 try{fd=await open(lock,'wx',0o600);}
 catch(e){
  if(e.code!=='EEXIST')throw e;
  let stale=false;
  try{
   const meta=JSON.parse(await readFile(lock,'utf8'));
   if(Number.isInteger(meta.pid)&&meta.pid>1&&Number.isFinite(meta.at)&&Date.now()-meta.at>30000){
    try{process.kill(meta.pid,0);}catch(check){if(check.code==='ESRCH')stale=true;}
   }
  }catch{}
  if(!stale)throw Error('Push operation already active');
  await unlink(lock);fd=await open(lock,'wx',0o600);
 }
 await fd.writeFile(JSON.stringify({pid:process.pid,at:Date.now()}));
 try{return await action();}finally{await fd.close();await unlink(lock);}
}
export function createPushStore(dir=DEFAULT_PUSH_DIRECTORY){
 return {
  async config(){
   return locked(dir,async()=>{
    const path=join(dir,'keys.json');let keys=await read(path,null);
    if(!keys){keys=webpush.generateVAPIDKeys();await atomic(path,keys);}
    return keys;
   });
  },
  async subscribe(input){
   const sub=validateSubscription(input);
   return locked(dir,async()=>{
    const path=join(dir,'subscriptions.json'),rows=await read(path,[]);
    const id=createHash('sha256').update(sub.endpoint).digest('hex');
    const index=rows.findIndex(r=>r.id===id);
    if(index<0&&rows.length>=5)throw Error('Owner device limit reached');
    const value={id,subscription:sub,createdAt:new Date().toISOString()};
    if(index<0)rows.push(value);else rows[index]=value;
    await atomic(path,rows);return {id,subscribed:true};
   });
  },
  async deliver(feed,{now=new Date(),send=webpush.sendNotification,enabled=false}={}){
   if(!enabled)return {status:'disabled',attempted:0,sent:0};
   if(!validFeed(feed)||feedAgeMinutes(feed,now)>180)return {status:'stale_source',attempted:0,sent:0};
   const candidates=browserDeadlineCandidates(feed.issues,false,now);
   return locked(dir,async()=>{
    const rows=await read(join(dir,'subscriptions.json'),[]);
    const keys=await read(join(dir,'keys.json'),null);
    if(!keys||!rows.length)return {status:'no_subscribers',attempted:0,sent:0};
    const path=join(dir,'deliveries.json'),all=await read(path,{});
    let attempted=0,sent=0;
    for(const issue of candidates)for(const row of rows){
     const event=issue.id+':'+issue.closeDate+':'+indiaToday(now)+':'+row.id;
     if(all[event])continue;
     // Reserve before network. Uncertain delivery is never blindly retried after a crash.
     all[event]={status:'attempted',at:now.toISOString()};
     await atomic(path,all);attempted++;
     const payload=JSON.stringify({title:'Atlas IPO deadline: '+issue.company,
       body:'Issue closes '+issue.closeDate+'. Verify issuer and broker cutoffs before applying.',
       tag:'atlas-ipo-'+createHash('sha256').update(event).digest('hex').slice(0,24),url:'/#ipo'});
     try{
      const result=await send(validateSubscription(row.subscription),payload,{TTL:3600,timeout:8000,
       vapidDetails:{subject:'https://atlas-control-center-pi.vercel.app',publicKey:keys.publicKey,privateKey:keys.privateKey}});
      if(result?.statusCode>=200&&result.statusCode<300){all[event].status='accepted_by_push_service';sent++;}
      else all[event].status='unconfirmed';
     }catch(e){all[event].status=[404,410].includes(e.statusCode)?'subscription_expired':'delivery_unconfirmed';}
     await atomic(path,all);
    }
    return {status:'completed',attempted,sent,deliveryConfirmedOnDevice:false};
   });
  }
 };
}
const nonce=randomBytes(32).toString('hex');
let nonceExpires=Date.now()+600000;
export async function handlePushRequest(req,res,store=createPushStore()){
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 const answer=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
 try{
  const host=new URL('http://'+req.headers.host);
  if(!['127.0.0.1','localhost'].includes(host.hostname)||Number(host.port||80)!==req.socket.localPort)return answer(403,{error:'owner_local_only'});
  if(req.headers.origin&&!['127.0.0.1','localhost'].includes(new URL(req.headers.origin).hostname))return answer(403,{error:'owner_local_only'});
  if(req.method==='GET'){
   const keys=await store.config();nonceExpires=Date.now()+600000;
   return answer(200,{supported:true,publicKey:keys.publicKey,pairing:nonce,mode:'OWNER_LOCAL_ONLY'});
  }
  if(req.method!=='POST')return answer(405,{error:'method_not_allowed'});
  const token=req.headers['x-atlas-push-pairing'];
  if(typeof token!=='string'||token.length!==nonce.length||Date.now()>nonceExpires||
    !timingSafeEqual(Buffer.from(token),Buffer.from(nonce)))return answer(403,{error:'pairing_required'});
  let text='',bytes=0;
  for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)return answer(413,{error:'body_too_large'});text+=chunk.toString('utf8');}
  const value=await store.subscribe(JSON.parse(text));
  return answer(200,value);
 }catch{return answer(400,{error:'push_setup_unavailable'});}
}
