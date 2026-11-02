import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {ensureSevenAccounts,loadSevenAccount,saveSevenAccount,listSevenAccounts} from '../src/seven-paper-store.js';
import {submitSevenSignal} from '../src/seven-paper-ledger.js';
const schema=readFileSync(new URL('../seven-paper-ledger.sql',import.meta.url),'utf8'),T=Date.parse('2026-10-30T04:30:00Z');
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(schema);
 const db={prepare(query){return {bind(...params){return {
  async first(){return sqlite.prepare(query).get(...params)||null},
  async run(){const value=sqlite.prepare(query).run(...params);return {meta:{changes:value.changes}}},
  async all(){return {results:sqlite.prepare(query).all(...params)}},
 }},async all(){return {results:sqlite.prepare(query).all()}}}}};
 return {sqlite,db};
}
test('seven isolated accounts are created once with zero fills',async()=>{
 const {db}=fixture(),created=await ensureSevenAccounts(db,T);
 assert.equal(created.accounts.length,7);
 assert.ok(created.accounts.every(x=>x.cashINR===100000&&x.paperFills===0));
 await ensureSevenAccounts(db,T+1000);
 assert.equal((await listSevenAccounts(db)).accounts.length,7);
});
test('revision CAS prevents replaying stale paper-account writes',async()=>{
 const {db}=fixture();await ensureSevenAccounts(db,T);
 const before=await loadSevenAccount(db,'scalpstorm_x');
 const next=submitSevenSignal(before,{strategyId:'scalpstorm_x',id:'signal-unique-000001',
  symbol:'RELIANCE',instrumentKey:'NSE_EQ|INE002A01018',side:'BUY',
  signalAt:new Date(T+1000).toISOString(),realOrdersEnabled:false},T+1000).state;
 await saveSevenAccount(db,before,next,T+1000);
 const stored=await loadSevenAccount(db,'scalpstorm_x');
 assert.equal(stored.revision,1);
 assert.equal(Object.keys(stored.pending).length,1);
 await assert.rejects(saveSevenAccount(db,before,next,T+1000),/concurrent or missing account/);
 assert.equal((await loadSevenAccount(db,'scalpstorm_x3')).cashPaise,10000000);
});
