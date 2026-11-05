import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {initializeVwap,advanceVwap,runForwardVwap} from '../src/forward-vwap.js';
import {readStrategyJournal} from '../src/strategy-journal.js';
import {intradaySignal} from '../src/seven-strategy-replay.js';
import {ensureSevenAccounts,loadSevenAccount} from '../src/seven-paper-store.js';
import {queueForwardStrategy,tickAllForward} from '../src/seven-forward-paper.js';
const day='2026-11-06',open=Date.parse(day+'T03:45:00Z');
const hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const bars=Array.from({length:375},(_,i)=>({time:open+i*60000,open:100+i*.002-.001,high:100+i*.002+.001,low:100+i*.002-.002,close:100+i*.002,volume:1000,knownAt:open+i*60000+70000,sourceSha256:'a'.repeat(64)}));
const nifty=[{...bars[0],open:20000,knownAt:open+70000},{...bars[14],close:20100,knownAt:open+15*60000+10000}];
const database=sqlite=>({prepare(sql){return {bind(...params){return {async first(){return sqlite.prepare(sql).get(...params)||null},async all(){return {results:sqlite.prepare(sql).all(...params)}},async run(){return {meta:{changes:sqlite.prepare(sql).run(...params).changes}}}}}}}});
test('incremental forward VWAP matches the retrospective first signal without seeing its future bars',()=>{
 let state=initializeVwap(day,'S0',bars.slice(0,25)),first;
 for(let i=25;i<80;i+=5){const r=advanceVwap(state,bars.slice(i,i+5),nifty,bars[i+4].time+120000);state=r.state;if(r.decision.status==='SIGNAL'){first=r.decision;break;}}
 assert.ok(first);assert.equal(first.barEndedAt,new Date(open+50*60000).toISOString());
 const context={symbol:'S0',niftyBars:bars.map((b,i)=>({...b,open:20000,close:i>=14?20100:20000})),roster:{day,knownAt:new Date(open+25*60000).toISOString(),eligibleCount:1375,top:Array.from({length:10},(_,i)=>({symbol:'S'+i,rank:i+1,volume:10000-i}))}};
 // Both algorithms agree on the first confirmed 10:00-or-later decision.
 const result=intradaySignal('vwap_precision',bars,context);assert.equal(result.status,'SIGNAL');assert.equal(result.signalBarTime+60000,Date.parse(first.barEndedAt));
 assert.equal(first.realOrdersEnabled,false);assert.equal(first.evidenceClass,'FORWARD_COMPLETED_SOURCE_ONLY');
});
test('VWAP rejects future bars, missing minutes, stale observations and unpublished Nifty data',()=>{
 const s=initializeVwap(day,'S0',bars.slice(0,25)),w=bars.slice(25,30),now=w.at(-1).time+120000;
 assert.throws(()=>advanceVwap(s,[...w.slice(0,4),{...w[4],time:w[4].time+60000}],nifty,now),/gap/);
 assert.throws(()=>advanceVwap(s,w,nifty,now+180000),/stale/);
 assert.throws(()=>advanceVwap(s,w,[nifty[0],{...nifty[1],knownAt:now+1}],now),/Nifty/);
 assert.equal(s.lastTime,bars[24].time);
});
test('persisted VWAP decision queues only its independent account; later quote fills once; unarmed rules fail closed',async()=>{
 const sql=new DatabaseSync(':memory:');for(const f of ['seven-paper-ledger.sql','live-minute.sql','forward-strategy-windows.sql'])sql.exec(readFileSync(new URL('../'+f,import.meta.url),'utf8'));
 const db=database(sql),env={DB:db,HISTORY_DB:db};await ensureSevenAccounts(db,open);
 const top=Array.from({length:10},(_,i)=>({symbol:'S'+i,instrument_key:'NSE_EQ|INE'+String(i+1).padStart(9,'0')}));
 const seedMap=new Map(top.map(t=>[t.instrument_key,bars.slice(0,25)]));
 const sourceUrl=new URL('https://api.upstox.com/v3/market-quote/ohlc');sourceUrl.searchParams.set('instrument_key',top.map(t=>t.instrument_key).join(','));sourceUrl.searchParams.set('interval','I1');
 for(let i=25;i<50;i++){const b=bars[i],rows=JSON.stringify(top.map(s=>[s.symbol,s.instrument_key,b.open,b.high,b.low,b.close,b.volume]));sql.prepare('INSERT INTO live_minute_receipts VALUES(?,?,?,?,?,?)').run(day,b.time,b.knownAt,sourceUrl.toString(),await hash(rows),rows);}
 for(const end of [39,44,49])await runForwardVwap(env,day,bars[end].time,bars[end].time+120000,{top,seedMap,nifty,roster:{day,eligibleCount:1375,knownAt:open+25*60000}});
 const now=bars[49].time+180000,windowEnd=bars[49].time;
 const journal=await readStrategyJournal(env,{day,strategyId:'vwap_precision'});assert.ok(journal.events.some(e=>e.reason==='VWAP_EMA_PULLBACK'));assert.equal(journal.riskPolicy.version,'paper-risk-2026-11-05-v4');
 assert.equal((await queueForwardStrategy(env,'vwap_precision',day,windowEnd,now)).queued,2);
 assert.equal((await queueForwardStrategy(env,'vwap_precision',day,windowEnd,now)).queued,0);
 assert.equal((await loadSevenAccount(db,'scalpstorm_x')).fills.length,0);
 assert.equal(Object.keys((await loadSevenAccount(db,'scalpstorm_x')).pending).length,0);
 const q=stamp=>new Map(top.map(t=>[t.instrument_key,{source:'Upstox Analytics',instrumentKey:t.instrument_key,providerAt:new Date(stamp).toISOString(),observedAt:new Date(stamp).toISOString(),ask:{price:100.1,quantity:1000},bid:{price:100,quantity:1000}}]));
 assert.equal((await tickAllForward(env,now,async()=>q(now),()=>now)).results.find(r=>r.strategyId==='vwap_precision').fills,0);
 const result=await tickAllForward(env,now+1000,async()=>q(now+1000),()=>now+1000);
 assert.equal(result.results.find(r=>r.strategyId==='vwap_precision').fills,2);
 assert.equal((await loadSevenAccount(db,'vwap_precision')).fills.length,2);
 await assert.rejects(()=>queueForwardStrategy(env,'scalpstorm_x2',day,windowEnd,now),/unarmed/);
 const before=(await loadSevenAccount(db,'vwap_precision')).revision;
 sql.prepare('UPDATE forward_strategy_windows SET payload_json=? WHERE window_end_ms=?').run('{}',windowEnd);
 await assert.rejects(()=>queueForwardStrategy(env,'vwap_precision',day,windowEnd,now+1000),/proof changed/);
 assert.equal((await loadSevenAccount(db,'vwap_precision')).revision,before);
 await assert.rejects(()=>readStrategyJournal(env,{day,strategyId:'vwap_precision'}),/proof changed/);
});
