import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {archiveTopVolumeStep,readTopVolumeHistory,topVolumeRoster} from '../src/top-volume-history.js';
import {readMarketReplay} from '../src/strategy-replay-reader.js';
import {createHash} from 'node:crypto';

const day='2026-11-03',at=Date.parse(day+'T09:40:00+05:30');
function wrapped(sql){return {prepare(query){return {bind(...args){return {
 async first(){return sql.prepare(query).get(...args)||null},
 async all(){return {results:sql.prepare(query).all(...args)}},
 async run(){const x=sql.prepare(query).run(...args);return {meta:{changes:x.changes}}},
}}}}}};
function fixture(){
 const main=new DatabaseSync(':memory:'),history=new DatabaseSync(':memory:');
 main.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 history.exec(readFileSync(new URL('../history-pilot.sql',import.meta.url),'utf8'));
 main.prepare('INSERT INTO coverage VALUES(?,?,?,?,?)').run(day,500,at,12,'UPSTOX_ANALYTICS_READONLY_V3');
 const stmt=main.prepare('INSERT INTO entry_snapshots(session,symbol,price_paise,cumulative_volume,observed_ms,source,instrument_key) VALUES(?,?,?,?,?,?,?)');
 for(let i=0;i<500;i++)stmt.run(day,`TST${String(i).padStart(4,'0')}`,10000+i,100000+i,at,'UPSTOX_ANALYTICS_READONLY_V3',`NSE_EQ|INE${String(i).padStart(9,'0')}`);
 return {main,history,env:{DB:wrapped(main),HISTORY_DB:wrapped(history),UPSTOX_ANALYTICS_TOKEN:'T'.repeat(120)}};
}
function candles(){return {status:'success',data:{candles:Array.from({length:375},(_,i)=>{
 const minute=555+i,time=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
 return [day+'T'+time+':00+05:30',100,101,99,100,1000,0];
})}}}
test('actual 0940 top ranked instrument is archived once and privately replayable',async()=>{
 const f=fixture(),slot=Date.parse(day+'T13:00:00Z');let calls=0;
 const top=await topVolumeRoster(f.env,day);
 assert.equal(top[0].symbol,'TST0499');
 const fetcher=async(url,options)=>{calls++;assert.match(url,/intraday\/NSE_EQ%7CINE000000499\/minutes\/1$/);
  assert.equal(options.method,'GET');return new Response(JSON.stringify(candles()),{headers:{'content-type':'application/json'}})};
 const first=await archiveTopVolumeStep(f.env,slot,fetcher,()=>slot+60000);
 assert.equal(first.status,'CAPTURED');assert.equal(first.minuteBars,375);
 const second=await archiveTopVolumeStep(f.env,slot,async()=>{throw Error('immutable receipt refetched')},()=>slot+120000);
 assert.equal(second.status,'VERIFIED_EXISTING');assert.equal(calls,1);
 const listing=await readTopVolumeHistory(f.env,day);
 assert.equal(listing.stocks.length,10);assert.equal(listing.stocks[0].rank,1);
 assert.equal(listing.stocks[0].archived,true);assert.equal(listing.stocks[1].archived,false);
 const replay=await readMarketReplay(f.env,{day,symbol:'TST0499'});
 assert.equal(replay.coverage,'COMPLETE_0940_TOP_VOLUME_STOCK_MINUTE_HISTORY');
 assert.equal(replay.bars.length,375);assert.equal(replay.realOrdersEnabled,false);
 f.history.prepare("UPDATE history_samples SET response_body='tampered'").run();
 await assert.rejects(readMarketReplay(f.env,{day,symbol:'TST0499'}),/source hash mismatch/);
});
test('missing identity, incomplete source and incomplete session fail closed',async()=>{
 const f=fixture(),slot=Date.parse(day+'T13:00:00Z');
 f.main.prepare("UPDATE entry_snapshots SET instrument_key=NULL WHERE symbol='TST0499'").run();
 await assert.rejects(archiveTopVolumeStep(f.env,slot,async()=>{throw Error('provider called')},()=>slot+60000),/unqualified 0940 identity/);
 f.main.prepare("UPDATE entry_snapshots SET instrument_key='NSE_EQ|INE000000499' WHERE symbol='TST0499'").run();
 f.main.prepare("DELETE FROM entry_snapshots WHERE symbol='TST0010'").run();
 await assert.rejects(topVolumeRoster(f.env,day),/incomplete or unqualified/);
 f.main.prepare('INSERT INTO entry_snapshots(session,symbol,price_paise,cumulative_volume,observed_ms,source,instrument_key) VALUES(?,?,?,?,?,?,?)').run(day,'TST0010',10010,100010,at,'UPSTOX_ANALYTICS_READONLY_V3','NSE_EQ|INE000000010');
 const incomplete=candles();incomplete.data.candles.pop();
 await assert.rejects(archiveTopVolumeStep(f.env,slot,async()=>new Response(JSON.stringify(incomplete),{headers:{'content-type':'application/json'}}),()=>slot+60000),/minute session incomplete/);
 assert.equal(f.history.prepare('SELECT COUNT(*) n FROM history_samples').get().n,0);
});
test('a preexisting partial same-key sample cannot be certified as complete top-volume history',async()=>{
 const f=fixture(),slot=Date.parse(day+'T13:00:00Z'),short=candles();short.data.candles.pop();
 const body=JSON.stringify(short),key='NSE_EQ|INE000000499';
 f.history.prepare('INSERT INTO history_samples VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
  key,day,'https://api.upstox.com/v3/historical-candle/intraday/'+encodeURIComponent(key)+'/minutes/1',
  day+'T11:01:00Z',createHash('sha256').update(body).digest('hex'),Buffer.byteLength(body),374,
  day+'T09:15:00+05:30',day+'T15:28:00+05:30',body,'FIXED_SAMPLE');
 const listing=await readTopVolumeHistory(f.env,day);
 assert.equal(listing.stocks[0].archived,false);
 await assert.rejects(archiveTopVolumeStep(f.env,slot,async()=>{throw Error('provider called')},()=>slot+60000),/stored minute session incomplete/);
 await assert.rejects(readMarketReplay(f.env,{day,symbol:'TST0499'}),/top-volume minute session incomplete/);
});
