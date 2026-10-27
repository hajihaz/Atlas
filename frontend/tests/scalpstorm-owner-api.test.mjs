import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,chmod,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createLocalApiServer} from '../server.js';
const report=()=>({schema:'atlas.scalpstorm-owner-report.v1',strategyId:'scalpstorm_x_0940',
 mode:'FORWARD',paperOnly:true,realOrdersEnabled:false,actualCapitalINR:0,
 ledgerVerified:true,days:[],positions:[],events:[],cashINR:100000,equityINR:100000,
 netPnlINR:0,feesINR:0}); // Test fixture only; never bundled into the product.
async function fixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'atlas-owner-'));
 const folder=path.join(root,'.atlas-runtime');await mkdir(folder,{mode:0o700});
 const file=path.join(folder,'scalpstorm-owner.json');
 await writeFile(file,JSON.stringify(report()),{mode:0o600});
 const server=createLocalApiServer({readOnly:true,ownerRoot:root});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
 return {base:'http://127.0.0.1:'+server.address().port,file,folder};
}
test('owner protocol is served without caching and cross-origin reads are refused',async t=>{
 const {base}=await fixture(t);
 const r=await fetch(base+'/api/scalpstorm-owner',{headers:{Origin:base}});
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal((await r.json()).strategyId,'scalpstorm_x_0940');
 assert.equal((await fetch(base+'/api/scalpstorm-owner',{headers:{Origin:'https://example.org'}})).status,403);
 assert.equal((await fetch(base+'/api/scalpstorm-owner',{method:'POST'})).status,405);
});
test('invalid dates, traversal, duplicate queries and history date queries fail closed',async t=>{
 const {base}=await fixture(t);
 for(const suffix of ['?date=2026-02-30','?date=2026-99-01','?date=../../x','?date=2026-10-27&date=2026-10-26','?token=x'])
  assert.equal((await fetch(base+'/api/scalpstorm-owner'+suffix)).status,400,suffix);
 assert.equal((await fetch(base+'/api/scalpstorm-history?date=2026-10-27')).status,400);
});
test('tampered authority and an unverified ledger are never displayed',async t=>{
 const {base,file}=await fixture(t);
 for(const change of [{realOrdersEnabled:true},{actualCapitalINR:1},{ledgerVerified:false},{strategyId:'sma_9_21'}]){
  await writeFile(file,JSON.stringify({...report(),...change}));
  assert.equal((await fetch(base+'/api/scalpstorm-owner')).status,503);
 }
});
test('private owner reports refuse public permissions and symlink replacements',async t=>{
 const {base,file,folder}=await fixture(t);await chmod(file,0o644);
 assert.equal((await fetch(base+'/api/scalpstorm-owner')).status,503);
 const target=file+'.original';await writeFile(target,JSON.stringify(report()),{mode:0o600});
 await rm(file);await symlink(target,file);
 assert.equal((await fetch(base+'/api/scalpstorm-owner')).status,503);
 await rm(file);await writeFile(file,JSON.stringify(report()),{mode:0o600});await chmod(folder,0o755);
 assert.equal((await fetch(base+'/api/scalpstorm-owner')).status,503);
});

test('independent audit remains private, dated and read-only',async t=>{
 const {base,folder}=await fixture(t);
 const audit={schema:'atlas.scalpstorm-audit.v1',strategyId:'scalpstorm_x_0940',
  paperOnly:true,realOrdersEnabled:false,actualCapitalINR:0,
  accountingVerified:true,sessionAccepted:false,openPositions:5};
 await writeFile(path.join(folder,'scalpstorm-audit.json'),JSON.stringify(audit),{mode:0o600});
 const r=await fetch(base+'/api/scalpstorm-audit',{headers:{Origin:base}});
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal((await r.json()).sessionAccepted,false);
 assert.equal((await fetch(base+'/api/scalpstorm-audit',{headers:{Origin:'https://example.org'}})).status,403);
 assert.equal((await fetch(base+'/api/scalpstorm-audit',{method:'POST'})).status,405);
 assert.equal((await fetch(base+'/api/scalpstorm-audit?date=../../x')).status,400);
});
