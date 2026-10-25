// Push only. No API, credential, quote or personal-ledger caching.
self.addEventListener('push',event=>{
 let input;try{input=event.data.json();}catch{return;}
 if(!input||typeof input.title!=='string'||!input.title.startsWith('Atlas ')||
   typeof input.body!=='string'||typeof input.tag!=='string')return;
 event.waitUntil(self.registration.showNotification(input.title.slice(0,160),{
  body:input.body.slice(0,500),tag:input.tag.slice(0,100),data:{url:'/#ipo',
   receiptId:typeof input.receiptId==='string'&&/^[a-f0-9]{64}$/.test(input.receiptId)?input.receiptId:null}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const receiptId=event.notification.data?.receiptId;
  if(typeof receiptId==='string'&&/^[a-f0-9]{64}$/.test(receiptId)){
   try{await fetch('/api/ipo-push',{method:'POST',credentials:'omit',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'receipt',receiptId})});}catch{}
  }
  const target=new URL('/#ipo',self.location.origin).href;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const same=windows.find(w=>new URL(w.url).origin===self.location.origin);
  if(same){await same.navigate(target);return same.focus();}
  return self.clients.openWindow(target);
 })());
});

const SHELL_CACHE='atlas-owner-shell-v1';
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{const cache=await caches.open(SHELL_CACHE);await cache.add('/');await self.skipWaiting();})());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('atlas-owner-shell-')&&key!==SHELL_CACHE)await caches.delete(key);await self.clients.claim();})());
});
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);
 if(event.request.method!=='GET'||u.origin!==self.location.origin)return;
 // Financial JSON, APIs, tokens, subscription routes and provider responses never enter this cache.
 if(u.pathname.startsWith('/api/')||u.pathname.endsWith('.json'))return;
 if(event.request.mode==='navigate'){
  event.respondWith((async()=>{try{const response=await fetch(event.request);if(response.ok)await (await caches.open(SHELL_CACHE)).put('/',response.clone());return response;}catch{return (await caches.match('/'))??Response.error();}})());
 }else if(u.pathname.startsWith('/assets/')){
  event.respondWith((async()=>{const hit=await caches.match(event.request);if(hit)return hit;const response=await fetch(event.request);if(response.ok)await (await caches.open(SHELL_CACHE)).put(event.request,response.clone());return response;})());
 }
});
