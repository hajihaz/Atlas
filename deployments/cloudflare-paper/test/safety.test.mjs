import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{testing} from '../src/index.js';
const ist=(day,clock)=>Date.parse(`${day}T${clock}+05:30`);
test('India market open/close and weekends',()=>{
 assert.equal(testing.session(ist('2026-10-27','09:14:00')),false);
 assert.equal(testing.session(ist('2026-10-27','09:15:00')),true);
 assert.equal(testing.session(ist('2026-10-27','15:29:00')),true);
 assert.equal(testing.session(ist('2026-10-27','15:30:00')),false);
 assert.equal(testing.session(ist('2026-10-31','10:00:00')),false);
});
test('reject timezone-naive schedule times',()=>{
 assert.throws(()=>testing.parseDate('2026-10-27T10:00:00'),/timezone/);
 assert.equal(testing.parseDate('2026-10-27T10:00:00+05:30'),ist('2026-10-27','10:00:00'));
});
test('always advertises paper-only and never exposes owner state',async()=>{
 const r=await worker.fetch(new Request('http://x/healthz'),{DB:{}});
 assert.equal((await r.json()).mode,'PAPER_ONLY');
 const u=await worker.fetch(new Request('http://x/api/cloud-paper/state'),{DB:{},OWNER_TOKEN:'a'.repeat(64)});
 assert.equal(u.status,401);
 const no=await worker.fetch(new Request('http://x/api/cloud-paper/state'),{});
 assert.equal(no.status,503);
});
test('retired automatic strategy cannot be rearmed through the Worker',async()=>{
 const req=new Request('https://paper.example/api/cloud-paper/strategy',{method:'POST',headers:{Authorization:'Bearer '+'O'.repeat(64),'Content-Type':'application/json'},body:JSON.stringify({enabled:true})});
 const res=await worker.fetch(req,{DB:{},OWNER_TOKEN:'O'.repeat(64)});
 assert.equal(res.status,404);
});

test('full NSE snapshot uses three bounded D1 statements instead of one per stock', async()=>{
 const now=ist('2026-10-27','09:40:02');
 const observed=new Date(now).toISOString();
 const quotes=Array.from({length:800},(_,i)=>({symbol:`STOCK${String(i).padStart(4,'0')}`,price_paise:10000+i,
   cumulative_volume:100000+i,observed_at:observed,source:'VERIFIED_FIXTURE_ONLY',exchange_open:true,
   instrument_key:`NSE_EQ|INE${String(i).padStart(9,'0')}`}));
 let sent=[];
 const db={
  prepare(sql){return {bind(...params){return {sql,params,first:async()=>null}}}},
  async batch(statements){sent=statements;return []},
 };
 const res=await testing.ingest(db,{quotes,coverage:{complete:true,eligible_count:800,nifty_change_bps:35}},now,'VERIFIED_FIXTURE_ONLY');
 assert.equal(res.accepted,800);
 assert.equal(sent.length,3,'Cloudflare Free cannot accept one D1 query per stock');
 assert.match(sent[0].sql,/json_each\(\?\)/);
 assert.equal(JSON.parse(sent[0].params[0]).length,800);
 assert.match(sent[1].sql,/INSERT INTO coverage/);
 assert.match(sent[2].sql,/INSERT OR IGNORE INTO entry_snapshots/);
});

test('reject stale, forged-source and partial large-universe snapshots before SQL', async()=>{
 const now=ist('2026-10-27','09:40:02');
 let writes=0;
 const db={prepare(){throw Error('unexpected query')},async batch(){writes++}};
 const q={symbol:'INFY',price_paise:10000,cumulative_volume:12345,observed_at:new Date(now).toISOString(),source:'FAKE_FEED',exchange_open:true};
 await assert.rejects(testing.ingest(db,{quotes:[q]},now,'AUTHORIZED_FEED'),/source quote/);
 await assert.rejects(testing.ingest(db,{quotes:[{...q,source:'AUTHORIZED_FEED',observed_at:new Date(now-20000).toISOString()}]},now,'AUTHORIZED_FEED'),/stale/);
 const qs=Array.from({length:31},(_,i)=>({...q,symbol:`STOCK${i}`,source:'AUTHORIZED_FEED'}));
 await assert.rejects(testing.ingest(db,{quotes:qs},now,'AUTHORIZED_FEED'),/capped at 30/);
 assert.equal(writes,0);
});

test('portfolio overview aggregates 75 symbols within Workers Free query budget', async()=>{
 const now=ist('2026-10-27','10:01:00');
 const positions=Array.from({length:75},(_,i)=>({symbol:`ST${String(i).padStart(4,'0')}`,qty:1}));
 let queries=0;
 const db={prepare(sql){queries++;return {bind(){return this},async all(){
   if(sql.includes('FROM orders'))return {results:[]};
   if(sql.includes('FROM events'))return {results:[]};
   if(sql.includes('FROM positions'))return {results:positions};
   throw Error(`Unexpected overview list query: ${sql}`);
 },async first(){
   if(sql.includes('FROM account'))return {cash_paise:10000000};
   if(sql.includes('FROM settings'))return {value:'0'};
   if(sql.includes('FROM runs'))return null;
   if(sql.includes('SUM(p.qty*q.price_paise)'))return {holdings_paise:750000,stale_count:0};
   throw Error(`Unexpected overview read: ${sql}`);
 }}}};
 const state=await testing.overview(db,now);
 assert.equal(state.positions.length,75);
 assert.equal(state.equity_paise,10750000);
 assert.ok(queries<=10,`Queried D1 ${queries} times; Free quota is 50`);
});

test('private session daybook is never public',async()=>{
 const res=await worker.fetch(new Request('https://paper.example/api/cloud-paper/daybook?day=2026-10-30'),
  {DB:{},OWNER_TOKEN:'O'.repeat(64)});
 assert.equal(res.status,401);
 assert.equal((await res.json()).error,'UNAUTHORIZED');
 for(const method of ['GET','POST']){
  const req=new Request('https://paper.example/api/cloud-paper/nse-reference?day=2026-10-29&kind=eod',{method});
  const denied=await worker.fetch(req,{DB:{},OWNER_TOKEN:'O'.repeat(64)});
  assert.equal(denied.status,401);
 }
});

test('hosted D1 without owner/feed secrets is not ready for paper orders',async()=>{
 const a=await worker.fetch(new Request('https://paper.example/healthz'),{DB:{}});
 const status=await a.json();
 assert.equal(status.backendConnected,true);
 assert.equal(status.configured,false);
 assert.equal(status.feedSourceConfigured,false);
 assert.equal(status.realOrdersEnabled,false);
 const b=await worker.fetch(new Request('https://paper.example/healthz'),{
  DB:{},OWNER_TOKEN:'O'.repeat(64),FEED_SOURCE_ID:'UPSTOX_ANALYTICS_READONLY_V3',UPSTOX_FEED_ENABLED:'true',UPSTOX_ANALYTICS_TOKEN:'T'.repeat(120)});
 const enabled=await b.json();
 assert.equal(enabled.configured,true);
 assert.equal(enabled.feedSourceConfigured,true);
 assert.equal(enabled.realOrdersEnabled,false);
});
