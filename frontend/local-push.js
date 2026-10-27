// Owner-local push subscriptions and delivery. Never imported by the browser bundle.
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,rename,unlink,lstat} from 'node:fs/promises';
import {withPrivateLock as locked} from './private-lock.js';
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
async function read(path,fallback){
 try{if((await lstat(path)).isSymbolicLink())throw Error('Unsafe push file');return JSON.parse(await readFile(path,'utf8'));}
 catch(e){if(e.code==='ENOENT')return fallback;throw e;}
}
async function atomic(path,value){
 const tmp=path+'.'+randomBytes(8).toString('hex')+'.tmp';
 try{await writeFile(tmp,JSON.stringify(value),{mode:0o600,flag:'wx'});await rename(tmp,path);}
 finally{await unlink(tmp).catch(()=>{});}
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
  async testDelivery(id,{send=webpush.sendNotification}={}){
   if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid owner device');
   const job=await locked(dir,async()=>{
    const rows=await read(join(dir,'subscriptions.json'),[]);
    const row=rows.find(item=>item.id===id),keys=await read(join(dir,'keys.json'),null);
    if(!row||!keys)throw Error('Owner device is not subscribed');
    const path=join(dir,'test-receipts.json'),records=await read(path,{});
    const recent=Object.values(records).filter(item=>item.subscriberId===id&&Date.now()-Date.parse(item.createdAt)<60000);
    if(recent.length)throw Error('Wait one minute before another test');
    const receiptId=randomBytes(32).toString('hex'),receiptProof=randomBytes(32).toString('hex');
    for(const key of Object.keys(records).slice(0,Math.max(0,Object.keys(records).length-49)))delete records[key];
    records[receiptId]={subscriberId:id,createdAt:new Date().toISOString(),status:'attempted',deviceConfirmed:false,
     proofHash:createHash('sha256').update(receiptProof).digest('hex')};
    await atomic(path,records);
    return {receiptId,subscription:validateSubscription(row.subscription),keys,payload:JSON.stringify({
     title:'Atlas notification test · '+receiptId.slice(0,6).toUpperCase(),body:'Test only. Tap this notification to confirm delivery on this device.',
     tag:'atlas-test-'+receiptId,receiptId,receiptProof,url:'/#ipo'})};
   });
   let transport='delivery_unconfirmed';
   try{
    const response=await send(job.subscription,job.payload,{TTL:300,timeout:8000,
     vapidDetails:{subject:'https://atlas-control-center-pi.vercel.app',...job.keys}});
    transport=response?.statusCode>=200&&response.statusCode<300?'accepted_by_push_service':'unconfirmed';
   }catch{}
   return locked(dir,async()=>{
    const path=join(dir,'test-receipts.json'),records=await read(path,{}),record=records[job.receiptId];
    if(!record)throw Error('Unknown delivery receipt');
    record.transportStatus=transport;
    if(!record.deviceConfirmed&&!record.browserDisplayed)record.status=transport;
    await atomic(path,records);
    return {receiptId:job.receiptId,status:record.status,deviceConfirmed:record.deviceConfirmed};
   });
  },
  async receipt(receiptId,{confirm=false,proof=null,stage='clicked'}={}){
   if(typeof receiptId!=='string'||!/^[a-f0-9]{64}$/.test(receiptId))throw Error('Invalid delivery receipt');
   return locked(dir,async()=>{
    let path=join(dir,'test-receipts.json'),records=await read(path,{}),record=records[receiptId];
    if(!record){path=join(dir,'deadline-receipts.json');records=await read(path,{});record=records[receiptId];}
    if(!record)throw Error('Unknown delivery receipt');
    if(confirm){
     if(typeof proof!=='string'||!/^[a-f0-9]{64}$/.test(proof)||typeof record.proofHash!=='string'||
       !/^[a-f0-9]{64}$/.test(record.proofHash)||
       !timingSafeEqual(Buffer.from(createHash('sha256').update(proof).digest('hex')),Buffer.from(record.proofHash)))
      throw Error('Invalid device receipt proof');
     const expires=record.kind==='deadline'?Date.parse(record.expiresAt):Date.parse(record.createdAt)+600000;
     if(!Number.isFinite(expires)||Date.now()>expires)throw Error('Delivery receipt expired');
     if(!['displayed','clicked'].includes(stage))throw Error('Invalid receipt stage');
     if(stage==='displayed'){
      record.browserDisplayed=true;record.displayedAt??=new Date().toISOString();
      if(!record.deviceConfirmed)record.status='browser_notification_displayed';
     }else{
      record.deviceConfirmed=true;record.status='device_notification_clicked';
      record.clickedAt??=new Date().toISOString();
     }
     await atomic(path,records);
    }
    return {receiptId,status:record.status,deviceConfirmed:record.deviceConfirmed,browserDisplayed:record.browserDisplayed===true,
     displayedAt:record.displayedAt??null,clickedAt:record.clickedAt??null};
   });
  },
  async deadlineAudit(){
   return locked(dir,async()=>{
    const records=await read(join(dir,'deadline-receipts.json'),{});
    return {mode:'OWNER_LOCAL_ONLY',deliveries:Object.entries(records)
     .sort((a,b)=>String(b[1].createdAt).localeCompare(String(a[1].createdAt))).slice(0,10)
     .map(([receiptId,r])=>({receiptId,issueId:r.issueId,company:r.company,closes:r.closes,alertDate:r.alertDate,
      createdAt:r.createdAt,status:r.status,transportStatus:r.transportStatus??'attempted',
      browserDisplayed:r.browserDisplayed===true,deviceConfirmed:r.deviceConfirmed===true,
      displayedAt:r.displayedAt??null,clickedAt:r.clickedAt??null}))};
   });
  },
  async deliver(feed,{now=new Date(),send=webpush.sendNotification,enabled=false}={}){
   if(!enabled)return {status:'disabled',attempted:0,sent:0};
   if(!validFeed(feed)||feedAgeMinutes(feed,now)>180)return {status:'stale_source',attempted:0,sent:0};
   const candidates=browserDeadlineCandidates(feed.issues,false,now);
   // Reserve every event and receipt under the lock, then release it before network I/O.
   // A service-worker acknowledgement may arrive before the push provider responds.
   const batch=await locked(dir,async()=>{
    const rows=await read(join(dir,'subscriptions.json'),[]);
    const keys=await read(join(dir,'keys.json'),null);
    if(!keys||!rows.length)return {status:'no_subscribers',jobs:[]};
    const path=join(dir,'deliveries.json'),all=await read(path,{});
    const receiptPath=join(dir,'deadline-receipts.json'),receipts=await read(receiptPath,{});
    const jobs=[];
    for(const issue of candidates)for(const row of rows){
     const event=issue.id+':'+issue.closeDate+':'+indiaToday(now)+':'+row.id;
     if(all[event])continue;
     const receiptId=randomBytes(32).toString('hex'),receiptProof=randomBytes(32).toString('hex');
     const createdAt=new Date().toISOString();
     const subscription=validateSubscription(row.subscription);
     all[event]={status:'attempted',at:now.toISOString(),receiptId};
     receipts[receiptId]={kind:'deadline',issueId:issue.id,company:issue.company,closes:issue.closeDate,
      alertDate:indiaToday(now),createdAt,expiresAt:new Date(Date.now()+48*3600000).toISOString(),
      status:'attempted',browserDisplayed:false,deviceConfirmed:false,
      proofHash:createHash('sha256').update(receiptProof).digest('hex')};
     jobs.push({event,receiptId,subscription,payload:JSON.stringify({
      title:'Atlas IPO deadline: '+issue.company,
      body:'The source calendar reports this issue closes '+issue.closeDate+'. Verify issuer and broker cutoffs before applying.',
      tag:'atlas-ipo-'+createHash('sha256').update(event).digest('hex').slice(0,24),url:'/#ipo',receiptId,receiptProof})});
    }
    if(jobs.length){
     // Keep a bounded audit, retaining all receipts in this batch.
     const keep=new Set(jobs.map(j=>j.receiptId));
     for(const [id] of Object.entries(receipts).sort((a,b)=>String(a[1].createdAt).localeCompare(String(b[1].createdAt)))){
      if(Object.keys(receipts).length<=2000)break;
      if(!keep.has(id))delete receipts[id];
     }
     await atomic(receiptPath,receipts);await atomic(path,all);
    }
    return {status:'completed',jobs,keys};
   });
   let sent=0;
   for(const job of batch.jobs){
    let transport='delivery_unconfirmed';
    try{
     const result=await send(job.subscription,job.payload,{TTL:3600,timeout:8000,
      vapidDetails:{subject:'https://atlas-control-center-pi.vercel.app',...batch.keys}});
     transport=result?.statusCode>=200&&result.statusCode<300?'accepted_by_push_service':'unconfirmed';
     if(transport==='accepted_by_push_service')sent++;
    }catch(e){transport=[404,410].includes(e?.statusCode)?'subscription_expired':'delivery_unconfirmed';}
    await locked(dir,async()=>{
     const path=join(dir,'deliveries.json'),all=await read(path,{});
     if(all[job.event]?.receiptId===job.receiptId){all[job.event].status=transport;await atomic(path,all);}
     const receiptPath=join(dir,'deadline-receipts.json'),receipts=await read(receiptPath,{}),record=receipts[job.receiptId];
     if(record){
      record.transportStatus=transport;
      if(!record.deviceConfirmed&&!record.browserDisplayed)record.status=transport;
      await atomic(receiptPath,receipts);
     }
    });
   }
   return {status:batch.status,attempted:batch.jobs.length,sent,deliveryConfirmedOnDevice:false};
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
   const receiptId=new URL(req.url??'/api/ipo-push','http://127.0.0.1').searchParams.get('receipt');
   if(receiptId)return answer(200,await store.receipt(receiptId));
   if(new URL(req.url??'/api/ipo-push','http://127.0.0.1').searchParams.get('audit')==='deadline')return answer(200,await store.deadlineAudit());
   const keys=await store.config();nonceExpires=Date.now()+600000;
   return answer(200,{supported:true,publicKey:keys.publicKey,pairing:nonce,mode:'OWNER_LOCAL_ONLY'});
  }
  if(req.method!=='POST')return answer(405,{error:'method_not_allowed'});
  let text='',bytes=0;
  for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)return answer(413,{error:'body_too_large'});text+=chunk.toString('utf8');}
  let input;try{input=JSON.parse(text);}catch{return answer(400,{error:'invalid_json'});}
  // A notification click proves possession of its encrypted 256-bit receipt capability.
  if(['receipt','displayed'].includes(input?.action))return answer(200,await store.receipt(input.receiptId,{
   confirm:true,proof:input.receiptProof,stage:input.action==='displayed'?'displayed':'clicked'}));
  const token=req.headers['x-atlas-push-pairing'];
  if(typeof token!=='string'||token.length!==nonce.length||Date.now()>nonceExpires||
    !timingSafeEqual(Buffer.from(token),Buffer.from(nonce)))return answer(403,{error:'pairing_required'});
  if(input?.action==='test')return answer(200,await store.testDelivery(input.id));
  const value=await store.subscribe(input);
  return answer(200,value);
 }catch{return answer(400,{error:'push_setup_unavailable'});}
}
