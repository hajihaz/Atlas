import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {createOwnerSession,ownerSessionValid} from '../src/owner-session.js';

const TOKEN='owner_'+ 'Z'.repeat(60);
const BASE='https://paper.example/api/cloud-paper/';
const env={DB:{},OWNER_TOKEN:TOKEN};
const request=(path,method='GET',headers={})=>new Request(BASE+path,{method,headers});

test('owner session cookie is HttpOnly, bounded, signed and cannot be forged',async()=>{
 const at=Date.parse('2026-11-02T12:00:00Z');
 const created=await createOwnerSession(TOKEN,at);
 assert.match(created.cookie,/HttpOnly; Secure; SameSite=Strict/);
 assert.match(created.cookie,/Max-Age=2592000/);
 const cookie=created.cookie.split(';')[0];
 assert.equal(await ownerSessionValid(request('session','GET',{Cookie:cookie}),TOKEN,at+1000),true);
 const forged=cookie.slice(0,-1)+(cookie.endsWith('0')?'1':'0');
 assert.equal(await ownerSessionValid(request('session','GET',{Cookie:forged}),TOKEN,at+1000),false);
 assert.equal(await ownerSessionValid(request('session','GET',{Cookie:cookie}),TOKEN,at+31*86400000),false);
 assert.equal(await ownerSessionValid(request('session','GET',{Cookie:cookie}),TOKEN+'rotated',at+1000),false);
});

test('paper worker exchanges bearer once and restores private view with cookie',async()=>{
 const denied=await worker.fetch(request('session'),env);
 assert.equal(denied.status,401);
 const login=await worker.fetch(request('session','POST',{Authorization:'Bearer '+TOKEN}),env);
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie')?.split(';')[0];
 assert.ok(cookie?.startsWith('atlas_owner_session='));
 const restored=await worker.fetch(request('session','GET',{Cookie:cookie}),env);
 assert.equal(restored.status,200);
 const catalog=await worker.fetch(request('seven-strategies','GET',{Cookie:cookie}),env);
 assert.equal(catalog.status,200);
 assert.equal((await catalog.json()).realOrdersEnabled,false);
 const logout=await worker.fetch(request('session','DELETE',{Cookie:cookie}),env);
 assert.equal(logout.status,200);
 assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
});
