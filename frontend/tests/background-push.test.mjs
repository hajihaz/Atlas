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
