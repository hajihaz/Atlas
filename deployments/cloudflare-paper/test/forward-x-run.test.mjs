import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {runForwardX,readForwardX} from '../src/forward-x-run.js';

const day='2026-11-04',open=Date.parse(day+'T03:45:00Z'),scheduled=Date.parse(day+'T04:26:00Z');
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
function db(sql){return {prepare(query){return {bind(...params){return {
 async first(){return sql.prepare(query).get(...params)||null},
 async all(){return {results:sql.prepare(query).all(...params)}},
 async run(){const r=sql.prepare(query).run(...params);return {meta:{changes:r.changes}}}
 }}}},async batch(statements){sql.exec('BEGIN');try{for(const s of statements)await s.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};}
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('../live-minute.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../nifty-opening-ohlc.sql',import.meta.url),'utf8'));
 const top=Array.from({length:10},(_,i)=>({symbol:`S${i}`,instrument_key:`NSE_EQ|INE0000000${i}`,volume:10000-i,eligibleCount:1376}));
 const roster=JSON.stringify(top);
 sql.prepare('INSERT INTO live_top_roster VALUES(?,?,?,?)').run(day,Date.parse(day+'T04:10:30Z'),await sha(roster),roster);
 for(const stock of top){
  const bars=Array.from({length:25},(_,i)=>[open+i*60000,100,101,99,100,1000]);
  const body=JSON.stringify({status:'success',data:{candles:bars}});
  sql.prepare('INSERT INTO live_opening_seed VALUES(?,?,?,?,?,?,?,?,?)').run(day,stock.instrument_key,stock.symbol,
   Date.parse(day+'T04:20:00Z'),'https://api.upstox.com/v3/historical-candle/intraday/'+encodeURIComponent(stock.instrument_key)+'/minutes/1',
   await sha(body),new TextEncoder().encode(body).length,body,JSON.stringify(bars));
 }
 const url=new URL('https://api.upstox.com/v3/market-quote/ohlc');
 url.searchParams.set('instrument_key',top.map(x=>x.instrument_key).join(','));url.searchParams.set('interval','I1');
 for(let i=0;i<5;i++){
  const ms=open+(35+i)*60000,bars=top.map((s,n)=>[s.symbol,s.instrument_key,101,103,100,n===0&&i===4?102:100.5,2000]);
  const json=JSON.stringify(bars);
  sql.prepare('INSERT INTO live_minute_receipts VALUES(?,?,?,?,?,?)').run(day,ms,ms+70000,url.toString(),await sha(json),json);
 }
 for(const [i,target] of ['09:15','09:29'].entries()){
  const ts=open+i*14*60000,body=JSON.stringify({status:'success',data:{'NSE_INDEX:Nifty 50':{
   instrument_token:'NSE_INDEX|Nifty 50',prev_ohlc:{ts,open:i?20040:20000,high:20060,low:19990,close:i?20050:20020,volume:1000}}}});
  const known=new Date(i?Date.parse(day+'T04:00:10Z'):Date.parse(day+'T03:46:10Z')).toISOString();
  sql.prepare('INSERT INTO nifty_open_ohlc_receipts VALUES(?,?,?,?,?,?,?)').run(day,target,
   'https://api.upstox.com/v3/market-quote/ohlc?instrument_key='+encodeURIComponent('NSE_INDEX|Nifty 50')+'&interval=I1',
   known,await sha(body),new TextEncoder().encode(body).length,body);
 }
 return {sql,env:{HISTORY_DB:db(sql)}};
}

test('cloud runner journals ten point-in-time decisions and never fills',async()=>{
 const f=await fixture(),result=await runForwardX(f.env,scheduled,()=>scheduled+5000);
 assert.equal(result.status,'EVALUATED');assert.equal(result.signals,1);assert.equal(result.noTrade,9);assert.equal(result.paperFills,0);
 const journal=await readForwardX(f.env,day);
 assert.equal(journal.runs.length,1);assert.equal(journal.decisions.length,10);
 assert.equal(journal.decisions.filter(x=>x.status==='SIGNAL').length,1);
 assert.equal((await runForwardX(f.env,scheduled,()=>scheduled+5000)).status,'VERIFIED_EXISTING');
});
test('missing one completed minute records SKIPPED with no invented signal',async()=>{
 const f=await fixture();f.sql.prepare('DELETE FROM live_minute_receipts WHERE bar_ms=?').run(open+39*60000);
 const result=await runForwardX(f.env,scheduled,()=>scheduled+5000);
 assert.equal(result.status,'SKIPPED');assert.equal((await readForwardX(f.env,day)).decisions.length,0);
});
