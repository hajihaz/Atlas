// Short, signed owner session. The bearer token never enters browser storage.
const NAME='atlas_owner_session';
const MAX_AGE_SECONDS=30*24*60*60;
const encoder=new TextEncoder();
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const validSecret=secret=>typeof secret==='string'&&secret.length>=32;
async function signature(secret,message){
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(message))));
}
function equal(a,b){
 if(a.length!==b.length)return false;
 let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
 return difference===0;
}
function cookieValue(req){
 const raw=req.headers.get('Cookie')||'';
 if(raw.length>4096)return null;
 const match=raw.match(/(?:^|;\s*)atlas_owner_session=([a-zA-Z0-9._-]{40,180})(?:;|$)/);
 return match?.[1]??null;
}
export async function ownerSessionValid(req,secret,now=Date.now()){
 if(!validSecret(secret))return false;
 const value=cookieValue(req);if(!value)return false;
 const parts=value.split('.');
 if(parts.length!==4||parts[0]!=='v1'||!/^\d{10}$/.test(parts[1])||
   !/^[a-f0-9]{32}$/.test(parts[2])||!/^[a-f0-9]{64}$/.test(parts[3]))return false;
 const expiry=Number(parts[1]),seconds=Math.floor(now/1000);
 if(expiry<=seconds||expiry>seconds+MAX_AGE_SECONDS)return false;
 return equal(parts[3],await signature(secret,parts.slice(0,3).join('.')));
}
export async function createOwnerSession(secret,now=Date.now()){
 if(!validSecret(secret))throw Error('owner session unavailable');
 const expiry=Math.floor(now/1000)+MAX_AGE_SECONDS;
 const nonce=hex(crypto.getRandomValues(new Uint8Array(16)));
 const base=`v1.${expiry}.${nonce}`;
 const value=base+'.'+await signature(secret,base);
 return {cookie:`${NAME}=${value}; Path=/api/cloud-paper; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict`,expiresAt:new Date(expiry*1000).toISOString()};
}
export const clearOwnerSession=()=>`${NAME}=; Path=/api/cloud-paper; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
