import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {ensureSevenAccounts} from '../src/seven-paper-store.js';
import {readStrategyJournal} from '../src/strategy-journal.js';

function database(schema){
 const sql=new DatabaseSync(':memory:');sql.exec(schema);
 return {sql,db:{prepare(query){return {bind(...params){return {
  async first(){return sql.prepare(query).get(...params)||null},
  async all(){return {results:sql.prepare(query).all(...params)}},
  async run(){const r=sql.prepare(query).run(...params);return {meta:{changes:r.changes}}},
 }}}}}};
}
async function fixture(){
 const account=database(readFileSync(new URL('../seven-paper-ledger.sql',import.meta.url),'utf8'));
 const history=database(readFileSync(new URL('../live-minute.sql',import.meta.url),'utf8'));
 await ensureSevenAccounts(account.db,Date.parse('2026-11-03T03:45:00Z'));
 return {env:{DB:account.db,HISTORY_DB:history.db},history:history.sql};
}
test('journal separates source-qualified decisions from paper fills',async()=>{
 const {env,history}=await fixture(),day='2026-11-03',window=Date.parse(day+'T04:20:00Z');
 const proof={status:'NO_TRADE',symbol:'RELIANCE',sourceSha256:Array(5).fill('a'.repeat(64))};
 history.prepare("INSERT INTO live_x_decisions VALUES(?,?,?,?,?,?,?,?)")
  .run(day,window,'RELIANCE','NSE_EQ|INE002A01018','NO_TRADE',null,'NO_CONFIRMED_BREAKOUT',JSON.stringify(proof));
 history.prepare("INSERT INTO live_x_runs VALUES(?,?,?,?,?)")
  .run(day,window+300000,window+420000,'SKIPPED','MISSING_OR_INVALID_POINT_IN_TIME_SOURCE');
 const x=await readStrategyJournal(env,{day,strategyId:'scalpstorm_x'});
 assert.equal(x.events.length,2);
 assert.deepEqual(x.events.map(e=>e.kind),['SKIPPED','NO_TRADE']);
 assert.equal(x.events[1].sourceHashes.length,5);
 assert.equal(x.account.fills,0);
 assert.equal(x.realOrdersEnabled,false);
 const other=await readStrategyJournal(env,{day,strategyId:'scalpstorm_x2'});
 assert.deepEqual(other.events,[]);
 assert.equal(other.executionStatus,'SIGNAL_ONLY_UNARMED');
});
test('journal rejects invalid strategy or corrupted source proof',async()=>{
 const {env,history}=await fixture(),day='2026-11-03';
 await assert.rejects(readStrategyJournal(env,{day,strategyId:'retired_strategy'}),/invalid strategy/);
 history.prepare("INSERT INTO live_x_decisions VALUES(?,?,?,?,?,?,?,?)")
  .run(day,Date.parse(day+'T04:20:00Z'),'RELIANCE','NSE_EQ|INE002A01018','SIGNAL','BUY','RULE','{}');
 await assert.rejects(readStrategyJournal(env,{day,strategyId:'scalpstorm_x'}),/decision source invalid/);
});
