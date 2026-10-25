import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createECDH,randomBytes} from 'node:crypto';
import {createPushStore,validateSubscription} from '../local-push.js';
const key=createECDH('prime256v1');key.generateKeys();
const sub={endpoint:'https://fcm.googleapis.com/fcm/send/atlas-test-only',keys:{p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
const now=new Date('2026-10-26T05:00:00Z');
function feed(){return {schemaVersion:1,generatedAt:now.toISOString(),issues:[
 {id:'synthetic-test-issuer',company:'Synthetic test issuer',board:'MAINBOARD',status:'OPEN',openDate:'2026-10-25',closeDate:'2026-10-26',detailSource:'https://example.test/fixture',sourceObservedAt:now.toISOString()}
]};}
test('push endpoints cannot become arbitrary network/SSRF destinations',()=>{
 for(const endpoint of ['http://127.0.0.1/x','https://fcm.googleapis.com.evil.test/x','https://user:secret@fcm.googleapis.com/x','https://169.254.169.254/x','https://example.test/x'])
  assert.throws(()=>validateSubscription({...sub,endpoint}));
 assert.equal(validateSubscription(sub).endpoint,sub.endpoint);
});
test('private subscription and VAPID storage is idempotent and permissions are restricted',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-push-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=createPushStore(dir),a=await store.config(),b=await store.config();
 assert.deepEqual(a,b);
 assert.deepEqual(await store.subscribe(sub),await store.subscribe(sub));
 const values=JSON.parse(await readFile(join(dir,'subscriptions.json'),'utf8'));
 assert.equal(values.length,1);assert.equal((await stat(join(dir,'keys.json'))).mode&0o777,0o600);
});
test('disabled, stale or closed IPO evidence cannot send a notification',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-push-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=createPushStore(dir);await store.config();await store.subscribe(sub);
 let calls=0;const send=async()=>{calls++;return {statusCode:201}};
 assert.equal((await store.deliver(feed(),{now,send})).status,'disabled');
 assert.equal((await store.deliver({...feed(),generatedAt:'2020-01-01T00:00:00Z'},{now,send,enabled:true})).status,'stale_source');
 const closed=feed();closed.issues[0].status='CLOSED';
 await store.deliver(closed,{now,send,enabled:true});assert.equal(calls,0);
});
test('attempt reservation survives retry, scopes by device and never claims device delivery',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-push-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=createPushStore(dir);await store.config();await store.subscribe(sub);
 let calls=0;const send=async(subscription,payload,options)=>{
  calls++;assert.equal(subscription.endpoint,sub.endpoint);assert.ok(JSON.parse(payload).tag.startsWith('atlas-ipo-'));
  assert.equal(options.timeout,8000);return {statusCode:201};
 };
 const first=await store.deliver(feed(),{now,send,enabled:true});
 const second=await store.deliver(feed(),{now,send,enabled:true});
 assert.equal(calls,1);assert.equal(first.sent,1);assert.equal(first.deliveryConfirmedOnDevice,false);assert.equal(second.attempted,0);
});
test('uncertain push failure is not blindly duplicated on restart',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-push-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=createPushStore(dir);await store.config();await store.subscribe(sub);
 let calls=0;const send=async()=>{calls++;throw Error('uncertain timeout')};
 await store.deliver(feed(),{now,send,enabled:true});
 await createPushStore(dir).deliver(feed(),{now,send,enabled:true});
 assert.equal(calls,1);
});

test('explicit device test stays separate from deadline alerts and requires an actual click receipt',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-test-receipt-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=createPushStore(dir);await store.config();const device=await store.subscribe(sub);
 let payload,calls=0;
 const send=async(s,body,options)=>{calls++;payload=JSON.parse(body);assert.equal(options.TTL,300);return {statusCode:201};};
 const sent=await store.testDelivery(device.id,{send});
 assert.equal(calls,1);assert.match(payload.title,/^Atlas notification test · [A-F0-9]{6}$/);
 assert.equal(sent.status,'accepted_by_push_service');assert.equal(sent.deviceConfirmed,false);
 assert.equal((await store.receipt(sent.receiptId)).deviceConfirmed,false);
 await assert.rejects(store.receipt('0'.repeat(64),{confirm:true}),/Unknown/);
 await assert.rejects(store.receipt(payload.receiptId,{confirm:true}),/Invalid device receipt proof/);
 await assert.rejects(store.receipt(payload.receiptId,{confirm:true,proof:'0'.repeat(64)}),/Invalid device receipt proof/);
 assert.ok(!JSON.stringify(sent).includes(payload.receiptProof));
 assert.ok(!(await readFile(join(dir,'test-receipts.json'),'utf8')).includes(payload.receiptProof));
 const displayed=await store.receipt(payload.receiptId,{confirm:true,proof:payload.receiptProof,stage:'displayed'});
 assert.equal(displayed.browserDisplayed,true);assert.equal(displayed.deviceConfirmed,false);
 assert.equal(displayed.status,'browser_notification_displayed');
 const clicked=await store.receipt(payload.receiptId,{confirm:true,proof:payload.receiptProof});
 assert.equal(clicked.deviceConfirmed,true);assert.equal(clicked.status,'device_notification_clicked');
 assert.deepEqual(await store.receipt(payload.receiptId,{confirm:true,proof:payload.receiptProof}),clicked);
 await assert.rejects(store.testDelivery(device.id,{send}),/one minute/);
 await assert.rejects(store.testDelivery('not-a-device',{send}),/Invalid/);
 await assert.rejects(readFile(join(dir,'deliveries.json')),e=>e.code==='ENOENT');
});
test('push-service failure never confirms a device or retries the same test immediately',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-test-failure-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=createPushStore(dir);await store.config();const device=await store.subscribe(sub);
 const sent=await store.testDelivery(device.id,{send:async()=>{throw Error('offline')}});
 assert.equal(sent.status,'delivery_unconfirmed');assert.equal(sent.deviceConfirmed,false);
 await assert.rejects(store.receipt('../keys.json'),/Invalid/);
 await assert.rejects(store.testDelivery(device.id,{send:()=>assert.fail()}),/one minute/);
});

test('service-worker click submits only the bounded receipt and opens the same-origin IPO page',async()=>{
 const {runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../public/atlas-sw.js',import.meta.url),'utf8');
 const handlers={},requests=[],opened=[],shown=[];
 const origin='http://127.0.0.1:4300';
 runInNewContext(source,{URL,fetch:async(url,options)=>{requests.push({url,options});return {ok:true};},
  self:{location:{origin},registration:{showNotification:async(...x)=>shown.push(x)},
   clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)},
   addEventListener:(name,handler)=>{handlers[name]=handler;}}});
 const receiptId='a'.repeat(64),receiptProof='b'.repeat(64);
 let operation;
 handlers.push({data:{json:()=>({title:'Atlas notification test',body:'Test only',tag:'test',receiptId,receiptProof,url:'https://evil.invalid'})},
  waitUntil:promise=>{operation=promise;}});
 await operation;
 assert.equal(shown[0][1].data.receiptId,receiptId);
 handlers.notificationclick({notification:{close(){this.data=null;},data:{receiptId,receiptProof,url:'https://evil.invalid'}},
  waitUntil:promise=>{operation=promise;}});
 await operation;
 assert.equal(requests.length,2);assert.equal(requests[0].url,'/api/ipo-push');
 assert.deepEqual(JSON.parse(requests[0].options.body),{action:'displayed',receiptId,receiptProof});
 assert.deepEqual(JSON.parse(requests[1].options.body),{action:'receipt',receiptId,receiptProof});
 assert.deepEqual(opened,[origin+'/#ipo']);
 handlers.notificationclick({notification:{close(){},data:{receiptId:'../keys.json'}},
  waitUntil:promise=>{operation=promise;}});
 await operation;assert.equal(requests.length,2);
});

test('deadline display and click can arrive before the provider response without losing proof',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-deadline-receipt-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=createPushStore(dir);await store.config();await store.subscribe(sub);
 let publicId,secret,calls=0;
 const send=async(s,body)=>{
  calls++;const p=JSON.parse(body);publicId=p.receiptId;secret=p.receiptProof;
  await assert.rejects(store.receipt(publicId,{confirm:true,proof:'0'.repeat(64)}),/Invalid/);
  await store.receipt(publicId,{confirm:true,proof:secret,stage:'displayed'});
  await store.receipt(publicId,{confirm:true,proof:secret,stage:'clicked'});
  // Concurrent scheduler sees the persisted reservation while the first provider call is in flight.
  assert.equal((await store.deliver(feed(),{now,send:()=>assert.fail('duplicate'),enabled:true})).attempted,0);
  return {statusCode:201};
 };
 const result=await store.deliver(feed(),{now,send,enabled:true});
 assert.equal(calls,1);assert.equal(result.sent,1);
 const receipt=await store.receipt(publicId);
 assert.equal(receipt.status,'device_notification_clicked');assert.equal(receipt.browserDisplayed,true);assert.equal(receipt.deviceConfirmed,true);
 await store.receipt(publicId,{confirm:true,proof:secret,stage:'displayed'});
 assert.equal((await store.receipt(publicId)).status,'device_notification_clicked');
 const audit=await store.deadlineAudit();
 assert.equal(audit.deliveries.length,1);assert.equal(audit.deliveries[0].issueId,'synthetic-test-issuer');
 assert.equal(audit.deliveries[0].transportStatus,'accepted_by_push_service');
 assert.ok(!JSON.stringify(audit).includes(secret));assert.ok(!JSON.stringify(audit).includes(sub.endpoint));
 assert.ok(!(await readFile(join(dir,'deadline-receipts.json'),'utf8')).includes(secret));
 assert.equal((await stat(join(dir,'deadline-receipts.json'))).mode&0o777,0o600);
});
test('test acknowledgements also survive an early click and remain separate from deadline records',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-test-early-receipt-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=createPushStore(dir);await store.config();const device=await store.subscribe(sub);
 const sent=await store.testDelivery(device.id,{send:async(s,body)=>{
  const p=JSON.parse(body);await store.receipt(p.receiptId,{confirm:true,proof:p.receiptProof});return {statusCode:201};
 }});
 assert.equal(sent.deviceConfirmed,true);assert.equal(sent.status,'device_notification_clicked');
 assert.deepEqual((await store.deadlineAudit()).deliveries,[]);
});
test('deadline receipt expiry rejects late proof, and public polling never confirms delivery',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-deadline-expiry-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=createPushStore(dir);await store.config();await store.subscribe(sub);let payload;
 await store.deliver(feed(),{now,enabled:true,send:async(s,body)=>{payload=JSON.parse(body);return {statusCode:201};}});
 assert.equal((await store.receipt(payload.receiptId)).deviceConfirmed,false);
 const path=join(dir,'deadline-receipts.json'),data=JSON.parse(await readFile(path,'utf8'));
 data[payload.receiptId].expiresAt='2000-01-01T00:00:00Z';
 const {writeFile}=await import('node:fs/promises');await writeFile(path,JSON.stringify(data),{mode:0o600});
 await assert.rejects(store.receipt(payload.receiptId,{confirm:true,proof:payload.receiptProof}),/expired/);
 assert.equal((await store.receipt(payload.receiptId)).deviceConfirmed,false);
});

test('a provider timeout after a genuine device click retains that click without resending',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-deadline-unknown-click-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=createPushStore(dir);await store.config();await store.subscribe(sub);let publicId;
 const sent=await store.deliver(feed(),{now,enabled:true,send:async(s,body)=>{
  const p=JSON.parse(body);publicId=p.receiptId;
  await store.receipt(publicId,{confirm:true,proof:p.receiptProof});throw Error('provider response lost');
 }});
 assert.equal(sent.sent,0);assert.equal((await store.receipt(publicId)).deviceConfirmed,true);
 const [audit]=(await store.deadlineAudit()).deliveries;
 assert.equal(audit.status,'device_notification_clicked');assert.equal(audit.transportStatus,'delivery_unconfirmed');
 assert.equal((await store.deliver(feed(),{now,enabled:true,send:()=>assert.fail('duplicate')})).attempted,0);
});
test('service-worker retries only the same receipt after transient server errors',async()=>{
 const {runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../public/atlas-sw.js',import.meta.url),'utf8');
 const handlers={},bodies=[];let operation;
 runInNewContext(source,{URL,setTimeout:callback=>{callback();return 0;},
  fetch:async(url,options)=>{bodies.push(options.body);return {ok:bodies.length===3,status:bodies.length===1?400:503};},
  self:{location:{origin:'http://127.0.0.1:4300'},registration:{showNotification:async()=>{}},
   clients:{},addEventListener:(name,handler)=>{handlers[name]=handler;}}});
 handlers.push({data:{json:()=>({title:'Atlas IPO deadline: synthetic fixture',body:'Fixture only',tag:'test',receiptId:'c'.repeat(64),receiptProof:'d'.repeat(64)})},
  waitUntil:promise=>{operation=promise;}});
 await operation;assert.equal(bodies.length,3);assert.ok(bodies.every(x=>x===bodies[0]));
});
