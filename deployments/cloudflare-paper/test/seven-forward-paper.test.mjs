import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createSevenAccount,submitSevenSignal,settleSevenPending,sevenRiskExit} from '../src/seven-paper-ledger.js';
import {ensureSevenAccounts,loadSevenAccount,saveSevenAccount} from '../src/seven-paper-store.js';
import {queueForwardX,tickSevenForward,normalizeBookResponse} from '../src/seven-forward-paper.js';

const DAY='2026-11-04',KEY='NSE_EQ|INE002A01018',SYMBOL='RELIANCE';
const at=(hour,minute)=>Date.parse(`${DAY}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`);
const db=sqlite=>({prepare(sql){return {bind(...params){return {
 async first(){return sqlite.prepare(sql).get(...params)||null},
 async all(){return {results:sqlite.prepare(sql).all(...params)}},
 async run(){const r=sqlite.prepare(sql).run(...params);return {meta:{changes:r.changes}}}
}}}}});
const quote=(stamp,price=100)=>({source:'Upstox Analytics',instrumentKey:KEY,lastPrice:price,
 lastTradeAt:new Date(stamp).toISOString(),providerAt:new Date(stamp).toISOString(),
 observedAt:new Date(stamp).toISOString(),
 bid:{price:price-.05,quantity:1000},ask:{price:price+.05,quantity:1000},sourceSha256:'a'.repeat(64)});

test('documented Upstox V3 depth requires exact identity and fresh provider response',()=>{
 const body={status:'success',data:{'NSE_EQ:RELIANCE':{instrument_token:KEY,symbol:SYMBOL,
  last_trade_time:String(at(4,37)),timestamp:new Date(at(4,37)).toISOString(),last_price:100,
  depth:{buy:[{price:99.9,quantity:100}],sell:[{price:100.1,quantity:100}]}}}};
 const valid=normalizeBookResponse(body,[KEY],at(4,37)+1000,'a'.repeat(64));
 assert.equal(valid.get(KEY).ask.price,100.1);
 assert.equal(valid.get(KEY).providerAt,new Date(at(4,37)).toISOString());
 assert.equal(normalizeBookResponse(body,[KEY],at(4,38)+12000,'a'.repeat(64)).size,0);
 const quiet={...body,data:{'NSE_EQ:RELIANCE':{...body.data['NSE_EQ:RELIANCE'],
  last_trade_time:String(at(4,30)),timestamp:new Date(at(4,37)).toISOString()}}};
 assert.equal(normalizeBookResponse(quiet,[KEY],at(4,37)+1000,'a'.repeat(64)).size,1);
 assert.throws(()=>normalizeBookResponse({...body,data:{'NSE_EQ:RELIANCE':{...body.data['NSE_EQ:RELIANCE'],instrument_token:'NSE_EQ|INE000000000'}}},[KEY],at(4,37)+1000,'a'.repeat(64)),/unrequested book identity/);
});

test('15:15 queues a paper exit without a quote; later provider book settles despite old last trade',async()=>{
 const accounts=new DatabaseSync(':memory:');accounts.exec(readFileSync(new URL('../seven-paper-ledger.sql',import.meta.url),'utf8'));
 const env={DB:db(accounts)};
 await ensureSevenAccounts(env.DB,at(3,45));
 const entryAt=at(4,35);
 const original=await loadSevenAccount(env.DB,'scalpstorm_x');
 const state=submitSevenSignal(original,{strategyId:'scalpstorm_x',id:'test-timed-exit-entry-01',
  symbol:SYMBOL,instrumentKey:KEY,side:'BUY',signalAt:new Date(entryAt).toISOString(),
  realOrdersEnabled:false},entryAt).state;
 const bought=settleSevenPending(state,SYMBOL,quote(entryAt+1000),entryAt+1000).state;
 assert.equal(Object.keys(bought.positions).length,1);
 await saveSevenAccount(env.DB,original,bought,entryAt+1000);
 const cutoff=at(9,45);
 assert.equal((await tickSevenForward(env,cutoff,async()=>new Map())).exits,1);
 const pending=await loadSevenAccount(env.DB,'scalpstorm_x');
 assert.equal(pending.pending[SYMBOL].reason,'MANDATORY_1515_EXIT');
 const later={...quote(cutoff+60000),lastTradeAt:new Date(entryAt+1000).toISOString()};
 assert.equal((await tickSevenForward(env,cutoff+60000,async()=>new Map([[KEY,later]]))).fills,1);
 const sold=await loadSevenAccount(env.DB,'scalpstorm_x');
 assert.equal(sold.fills.at(-1).mode,'HYPOTHETICAL_NEXT_OBSERVED_BOOK');
 assert.equal(Object.keys(sold.positions).length,0);
 assert.equal(sold.cashPaise,10000000+sold.realizedPaise);
});

test('qualified X signal queues once; later book fills; 15:15 exit waits for another trade',async()=>{
 const accounts=new DatabaseSync(':memory:');accounts.exec(readFileSync(new URL('../seven-paper-ledger.sql',import.meta.url),'utf8'));
 const history=new DatabaseSync(':memory:');history.exec(`CREATE TABLE live_x_runs(source_date TEXT,window_end_ms INTEGER,status TEXT);
 CREATE TABLE live_x_decisions(source_date TEXT,window_end_ms INTEGER,symbol TEXT,instrument_key TEXT,status TEXT,side TEXT,decision_json TEXT);`);
 const env={DB:db(accounts),HISTORY_DB:db(history)};
 await ensureSevenAccounts(env.DB,at(3,45));
 const windowEnd=at(4,34),now=at(4,37);
 history.prepare('INSERT INTO live_x_runs VALUES(?,?,?)').run(DAY,windowEnd,'EVALUATED');
 const decision={strategyId:'scalpstorm_x',sourceDate:DAY,symbol:SYMBOL,status:'SIGNAL',side:'BUY',
  barEndedAt:new Date(at(4,35)).toISOString(),reason:'NIFTY_AND_OPENING_RANGE_CONFIRMED',sourceSha256:Array(5).fill('a'.repeat(64))};
 history.prepare('INSERT INTO live_x_decisions VALUES(?,?,?,?,?,?,?)').run(DAY,windowEnd,SYMBOL,KEY,'SIGNAL','BUY',JSON.stringify(decision));
 assert.equal((await queueForwardX(env,DAY,windowEnd,now)).queued,1);
 assert.equal((await queueForwardX(env,DAY,windowEnd,now)).queued,0);
 let state=await loadSevenAccount(env.DB,'scalpstorm_x');
 assert.equal(state.fills.length,0);
 const books=async()=>new Map([[KEY,quote(at(4,37)+1000)]]);
 assert.equal((await tickSevenForward(env,at(4,37)+1000,books)).fills,1);
 state=await loadSevenAccount(env.DB,'scalpstorm_x');
 assert.equal(state.fills.length,1);assert.equal(state.fills[0].quoteSha256,'a'.repeat(64));
 const cutoff=at(9,45);
 assert.equal((await tickSevenForward(env,cutoff,async()=>new Map([[KEY,quote(cutoff)]]))).exits,1);
 state=await loadSevenAccount(env.DB,'scalpstorm_x');
 assert.equal(state.fills.length,1);assert.equal(Object.keys(state.pending).length,1);
 assert.equal((await tickSevenForward(env,cutoff+1000,async()=>new Map([[KEY,quote(cutoff+1000)]]))).fills,1);
 state=await loadSevenAccount(env.DB,'scalpstorm_x');
 assert.equal(state.fills.length,2);assert.equal(Object.keys(state.positions).length,0);
 assert.equal(state.cashPaise,10000000+state.realizedPaise);
});

test('short paper sale reserves capital and later cover releases it; stale book does not fill',()=>{
 const start=at(4,30),base=createSevenAccount('scalpstorm_x',start-1000);
 const entry=submitSevenSignal(base,{strategyId:'scalpstorm_x',id:'short-entry-unique-001',
  symbol:SYMBOL,instrumentKey:KEY,side:'SELL',signalAt:new Date(start).toISOString(),
  reason:'NIFTY_AND_OPENING_RANGE_CONFIRMED',realOrdersEnabled:false},start).state;
 assert.equal(settleSevenPending(entry,SYMBOL,quote(start),start).status,'WAIT_FRESH_QUOTE');
 const opened=settleSevenPending(entry,SYMBOL,quote(start+1000),start+1000).state;
 assert.equal(opened.positions[SYMBOL].direction,'SHORT');
 assert.ok(opened.cashPaise<base.cashPaise);
 const exitSignal=sevenRiskExit(opened,SYMBOL,quote(start+2000,98),start+2000);
 assert.equal(exitSignal.side,'BUY');
 const pending=submitSevenSignal(opened,exitSignal,start+2000).state;
 assert.equal(settleSevenPending(pending,SYMBOL,quote(start+2000,98),start+2000).status,'WAIT_FRESH_QUOTE');
 const closed=settleSevenPending(pending,SYMBOL,quote(start+3000,98),start+3000).state;
 assert.equal(Object.keys(closed.positions).length,0);
 assert.equal(closed.cashPaise,10000000+closed.realizedPaise);
 assert.ok(closed.realizedPaise>0);
});

test('versioned X pilot admits at most two daily entries and blocks late entries',()=>{
 const now=at(4,40),base=createSevenAccount('scalpstorm_x',at(3,45));
 const send=(state,symbol,id,time)=>submitSevenSignal(state,{strategyId:'scalpstorm_x',id,
  symbol,instrumentKey:KEY,side:'BUY',signalAt:new Date(time).toISOString(),
  reason:'NIFTY_AND_OPENING_RANGE_CONFIRMED',realOrdersEnabled:false},time);
 const a=send(base,'RELIANCE','risk-cap-signal-0001',now);
 const b=send(a.state,'TCS','risk-cap-signal-0002',now);
 const blocked=send(b.state,'INFY','risk-cap-signal-0003',now);
 assert.equal(blocked.status,'MAX_DAILY_ENTRIES');
 assert.equal(blocked.state.events.at(-1).reason,'MAX_DAILY_ENTRIES');
 assert.equal(send(base,'RELIANCE','late-entry-signal-01',at(9,30)).status,'ENTRY_WINDOW_CLOSED');
});

test('two restored carryovers block new entries and recover only from later sufficient fresh books',async()=>{
 const accounts=new DatabaseSync(':memory:');accounts.exec(readFileSync(new URL('../seven-paper-ledger.sql',import.meta.url),'utf8'));
 const env={DB:db(accounts)},now=Date.parse('2026-11-05T04:15:00Z');
 await ensureSevenAccounts(env.DB,at(3,45));
 const original=await loadSevenAccount(env.DB,'scalpstorm_x'),restored=structuredClone(original);
 restored.cashPaise=8418970;restored.feesPaise=1580;restored.revision++;
 restored.positions={
  EQUITASBNK:{qty:102,entryCostPaise:582084,entryPricePaise:5701,instrumentKey:'NSE_EQ|INE063P01018',direction:'LONG',openedAt:at(4,33),stopPaise:5643,targetPaise:5787,riskPolicyVersion:'paper-risk-2026-11-04-v1'},
  IDEA:{qty:812,entryCostPaise:998946,entryPricePaise:1229,instrumentKey:'NSE_EQ|INE669E01016',direction:'LONG',openedAt:at(4,33),stopPaise:1216,targetPaise:1248,riskPolicyVersion:'paper-risk-2026-11-04-v1'}};
 // Isolated fixture mirrors quantities/cash only. Prices below are synthetic, never production fills.
 await saveSevenAccount(env.DB,original,restored,now);
 const blocked=submitSevenSignal(restored,{strategyId:'scalpstorm_x',id:'carryover-block-new-entry-01',symbol:SYMBOL,instrumentKey:KEY,side:'BUY',signalAt:new Date(now).toISOString(),realOrdersEnabled:false},now);
 assert.equal(blocked.status,'UNRESOLVED_CARRYOVER');
 assert.equal((await tickSevenForward(env,now,async()=>new Map())).exits,2);
 let state=await loadSevenAccount(env.DB,'scalpstorm_x');
 assert.equal(state.cashPaise,8418970);assert.equal(state.fills.length,0);
 assert.ok(Object.values(state.pending).every(p=>p.reason==='CARRYOVER_RECOVERY'));
 const books=(stamp,depth=10000)=>new Map(Object.values(restored.positions).map(p=>[p.instrumentKey,{
  source:'Upstox Analytics',instrumentKey:p.instrumentKey,lastTradeAt:new Date(at(4,33)).toISOString(),
  providerAt:new Date(stamp).toISOString(),observedAt:new Date(stamp).toISOString(),
  bid:{price:p.entryPricePaise/100,quantity:depth},ask:{price:p.entryPricePaise/100+.01,quantity:depth},sourceSha256:'b'.repeat(64)}]));
 assert.equal((await tickSevenForward(env,now+1000,async()=>books(now))).fills,0);
 assert.equal((await tickSevenForward(env,now+2000,async()=>books(now+2000,1))).fills,0);
 const result=await tickSevenForward(env,now+60000,async()=>books(now+60000));
 assert.equal(result.fills,2);assert.equal(result.openPositions,0);assert.equal(result.pending,0);
 state=await loadSevenAccount(env.DB,'scalpstorm_x');
 assert.equal(state.cashPaise,10000000+state.realizedPaise);
 assert.ok(state.fills.every(f=>f.mode==='HYPOTHETICAL_NEXT_OBSERVED_BOOK'&&f.reason==='CARRYOVER_RECOVERY'));
 assert.ok(state.fills.every(f=>f.riskPolicyVersion==='paper-risk-2026-11-04-v3'));
});
