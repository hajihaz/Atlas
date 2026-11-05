import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {ensureSevenAccounts,loadSevenAccount,saveSevenAccount} from '../src/seven-paper-store.js';
import {submitSevenSignal} from '../src/seven-paper-ledger.js';
import {fetchPaperBooks,tickSevenForward,persistPaperBook} from '../src/seven-forward-paper.js';
const T=Date.parse('2026-11-06T04:30:00Z'),KEY='NSE_EQ|INE002A01018';
function database(sqlite){return {prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){return {meta:{changes:sqlite.prepare(sql).run(...args).changes}}}}}}}};}
async function fixture(){
 const sql=new DatabaseSync(':memory:');for(const file of ['seven-paper-ledger.sql','paper-book-receipts.sql'])sql.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
 const db=database(sql),env={DB:db,HISTORY_DB:db,UPSTOX_ANALYTICS_TOKEN:'x'.repeat(120)};
 await ensureSevenAccounts(db,T-10000);const before=await loadSevenAccount(db,'scalpstorm_x');
 const pending=submitSevenSignal(before,{strategyId:before.strategyId,id:'archived-book-entry-0001',symbol:'RELIANCE',instrumentKey:KEY,side:'BUY',signalAt:new Date(T-2000).toISOString(),realOrdersEnabled:false},T-2000).state;
 await saveSevenAccount(db,before,pending,T-2000);return {sql,env,pending};
}
const source=()=>new Response(JSON.stringify({status:'success',data:{'NSE_EQ:RELIANCE':{instrument_token:KEY,symbol:'RELIANCE',last_trade_time:String(T+1000),timestamp:new Date(T+1000).toISOString(),last_price:100,depth:{buy:[{price:99.9,quantity:1000}],sell:[{price:100.1,quantity:1000}]}}}}));
test('exact market-book bytes persist before settlement and new fill binds intent and observation times',async()=>{
 const {env,sql}=await fixture();const books=()=>fetchPaperBooks(env,[KEY],async()=>source(),()=>T+1000);
 const result=await tickSevenForward(env,T,books,()=>T+1000);
 assert.equal(result.fills,1);
 const state=await loadSevenAccount(env.DB,'scalpstorm_x'),fill=state.fills[0],receipt=sql.prepare('SELECT * FROM paper_book_receipts').get();
 assert.equal(receipt.body_sha256,fill.quoteSha256);assert.equal(receipt.http_status,200);assert.equal(fill.instrumentKey,KEY);assert.equal(receipt.requested_keys_json,JSON.stringify([KEY]));
 assert.equal(fill.intentCreatedAt,T-2000);assert.equal(fill.observedAt,T+1000);assert.equal(fill.processedAt,T+1000);
 assert.equal(JSON.parse(receipt.response_body).data['NSE_EQ:RELIANCE'].depth.sell[0].price,100.1);
 assert.equal(receipt.response_body.includes(env.UPSTOX_ANALYTICS_TOKEN),false);
});
test('failed receipt persistence cannot create a paper fill',async()=>{
 const {env,pending}=await fixture();env.HISTORY_DB={prepare(){throw Error('fixture storage failure')}};
 const books=()=>fetchPaperBooks(env,[KEY],async()=>source(),()=>T+1000);
 await assert.rejects(()=>tickSevenForward(env,T,books,()=>T+1000),/book unavailable/);
 const state=await loadSevenAccount(env.DB,'scalpstorm_x');assert.deepEqual(state,pending);
});
test('tampered body or wrong source fails before a receipt can be written',async()=>{
 const {env,sql}=await fixture(),map=await fetchPaperBooks(env,[KEY],async()=>source(),()=>T+1000);
 await assert.rejects(()=>persistPaperBook(env,{...map.receipt,raw:'{}'}),/receipt proof/);
 await assert.rejects(()=>persistPaperBook(env,{...map.receipt,sourceUrl:'https://example.invalid/'}),/receipt source/);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM paper_book_receipts').get().n,0);
});

test('identical bytes retain their first observation across different bounded request sets',async()=>{
 const {env,sql}=await fixture(),first=await fetchPaperBooks(env,[KEY],async()=>source(),()=>T+1000);
 assert.equal(await persistPaperBook(env,first.receipt),T+1000);
 const next=await fetchPaperBooks(env,[KEY,'NSE_EQ|INF277KA1984'],async()=>source(),()=>T+2000);
 assert.equal(await persistPaperBook(env,next.receipt),T+1000);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM paper_book_receipts').get().n,1);
});
test('a previously observed snapshot cannot fill a later intent by exploiting provider clock skew',async()=>{
 const {env}=await fixture();
 const skewed=async()=>{const body=await source().json();body.data['NSE_EQ:RELIANCE'].timestamp=new Date(T+1800).toISOString();return new Response(JSON.stringify(body));};
 const first=await fetchPaperBooks(env,[KEY],skewed,()=>T+1000);await persistPaperBook(env,first.receipt);
 const base=await loadSevenAccount(env.DB,'vwap_precision'),at=T+1500;
 const pending=submitSevenSignal(base,{strategyId:base.strategyId,id:'clock-skew-independent-01',symbol:'RELIANCE',instrumentKey:KEY,side:'BUY',signalAt:new Date(at).toISOString(),realOrdersEnabled:false},at).state;
 await saveSevenAccount(env.DB,base,pending,at);
 const books=()=>fetchPaperBooks(env,[KEY],skewed,()=>T+2500);
 const result=await tickSevenForward(env,T+2500,books,()=>T+2500,{strategyId:'vwap_precision'});
 assert.equal(result.fills,0);assert.deepEqual(await loadSevenAccount(env.DB,'vwap_precision'),pending);
});
