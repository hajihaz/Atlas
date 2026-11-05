import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {runAdditionalForward} from '../src/forward-extra-run.js';
import {collectXtremeContext,loadExtraContexts} from '../src/forward-context.js';
import {archiveEtfDaily} from '../src/etf-daily-archive.js';
import {readQualifiedPeriodInputs,collectPeriodCalendar,qualifyCalendar,PRICE_SOURCE_POLICY} from '../src/forward-period-source.js';
import {periodDecisions,PERIOD_POLICY} from '../src/forward-period.js';
import {runPeriodForward} from '../src/forward-period-run.js';
import {ensureSevenAccounts,loadSevenAccount} from '../src/seven-paper-store.js';
import {tickSevenForward} from '../src/seven-forward-paper.js';
import {paperExperimentReport} from '../src/paper-experiment-report.js';
const DAY='2026-11-05',OPEN=Date.parse(DAY+'T03:45:00Z'),SHA='a'.repeat(64);
const hash=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');
const db=s=>({prepare(sql){return{bind(...p){return{async first(){return s.prepare(sql).get(...p)||null},async all(){return{results:s.prepare(sql).all(...p)}},async run(){const r=s.prepare(sql).run(...p);return{meta:{changes:r.changes}}}}}}}});
function fixture(){const s=new DatabaseSync(':memory:');for(const f of ['seven-paper-ledger.sql','live-minute.sql','forward-strategy-windows.sql','forward-context.sql'])s.exec(readFileSync(new URL('../'+f,import.meta.url),'utf8'));s.exec("CREATE TABLE strategy_context_receipts(source_date TEXT,kind TEXT,known_ms INTEGER,source_url TEXT,body_json TEXT,body_sha256 TEXT,metadata_json TEXT)");return{sql:s,env:{DB:db(s),HISTORY_DB:db(s),UPSTOX_ANALYTICS_TOKEN:'fake-readonly-fixture-token'.repeat(8)}}}
test('calendar distinguishes weekend, exchange holiday and monthly first session without assuming yesterday traded',()=>{
 const body={status:'success',data:Array.from({length:10},(_,i)=>({date:'2026-01-'+String(i+1).padStart(2,'0'),closed_exchanges:['NSE'],open_exchanges:[]}))};
 assert.equal(qualifyCalendar(body,'2026-11-09').previousSession,'2026-11-06');
 assert.equal(qualifyCalendar(body,'2026-11-07').session,false);
 assert.equal(qualifyCalendar(body,'2026-12-01').firstSessionOfMonth,true);
 const special=structuredClone(body);special.data.push({date:DAY,closed_exchanges:[],open_exchanges:[{exchange:'NSE',start_time:OPEN+60000,end_time:OPEN+375*60000}]});
 assert.throws(()=>qualifyCalendar(special,DAY),/nonstandard/);
 assert.equal(PRICE_SOURCE_POLICY.dividendAdjusted,false);assert.equal(PRICE_SOURCE_POLICY.independentlyReconciled,false);
});
test('canonical captured minutes produce three persisted, individually source-gated journals',async()=>{
 const {sql,env}=fixture(),top=Array.from({length:10},(_,i)=>({symbol:'S'+i,instrument_key:'NSE_EQ|INE'+String(i+1).padStart(9,'0')}));
 const bar=i=>({time:OPEN+i*60000,open:100,high:101,low:99,close:100,volume:1000});
 const url=new URL('https://api.upstox.com/v3/market-quote/ohlc');url.searchParams.set('instrument_key',top.map(x=>x.instrument_key).join(','));url.searchParams.set('interval','I1');
 for(let i=25;i<40;i++){const b=bar(i),raw=JSON.stringify(top.map(s=>[s.symbol,s.instrument_key,b.open,b.high,b.low,b.close,b.volume]));sql.prepare('INSERT INTO live_minute_receipts VALUES(?,?,?,?,?,?)').run(DAY,b.time,b.time+61000,url.toString(),await hash(raw),raw)}
 const input={top,seedMap:new Map(top.map(x=>[x.instrument_key,Array.from({length:25},(_,i)=>bar(i))])),roster:{day:DAY,eligibleCount:1000,knownAt:OPEN+25*60000},nifty:[{time:OPEN,open:100,knownAt:OPEN+60000,sourceSha256:SHA},{time:OPEN+14*60000,close:100.5,knownAt:OPEN+15*60000,sourceSha256:SHA}]};
 const result=await runAdditionalForward(env,DAY,bar(39).time,bar(39).time+120000,input);
 assert.ok(result.every(x=>x.status==='EVALUATED'));
 const rows=sql.prepare('SELECT * FROM forward_strategy_windows').all();assert.equal(rows.length,3);
 for(const r of rows){const p=JSON.parse(r.payload_json);assert.equal(p.decisions.length,10);assert.ok(p.decisions.every(d=>d.status==='NO_TRADE'));assert.equal(await hash(r.payload_json),r.payload_sha256)}
 // A lost source minute cannot be silently replaced by a later historical candle.
 sql.prepare('DELETE FROM live_minute_receipts WHERE bar_ms=?').run(bar(35).time);
 sql.prepare('DELETE FROM forward_strategy_windows').run();
 assert.ok((await runAdditionalForward(env,DAY,bar(39).time,bar(39).time+120000,input)).every(x=>x.status==='SKIPPED'));
});
test('Xtreme collector binds profile, 20 complete same-time volumes and exact sector source; later readers use compact proof',async()=>{
 const {sql,env}=fixture(),key='NSE_EQ|INE040A01034',top=Array.from({length:10},(_,i)=>({symbol:i?'S'+i:'HDFCBANK',instrument_key:i?'NSE_EQ|INE'+String(i).padStart(9,'0'):key})),raw=JSON.stringify(top);
 sql.prepare('INSERT INTO live_top_roster VALUES(?,?,?,?)').run(DAY,OPEN+25*60000,await hash(raw),raw);
 const history=[];
 for(let d=1;d<=40;d++)for(let i=0;i<5;i++)history.push([new Date(OPEN-d*86400000+i*300000).toISOString(),100,101,99,100,1000]);
 const sector=Array.from({length:15},(_,i)=>[new Date(OPEN+i*60000).toISOString(),100,101,99,100.1,100]);
 const urls=[],fetcher=async url=>{urls.push(url);let data;
  if(url.endsWith('/profile'))data={sector:'Banks'};
  else if(url.includes('/intraday/'))data={candles:sector};
  else {const parts=url.split('/'),to=parts.at(-2),from=parts.at(-1);data={candles:history.filter(c=>{const d=c[0].slice(0,10);return d>=from&&d<=to})}}
  return new Response(JSON.stringify({status:'success',data}),{status:200});
 };
 const at=OPEN+28*60000;
 assert.equal((await collectXtremeContext(env,DAY,0,{fetcher,clock:()=>at})).status,'CONTEXT_RECORDED');
 assert.equal(urls.length,4);assert.ok(urls.every(u=>u.startsWith('https://api.upstox.com/')));
 const stored=sql.prepare('SELECT * FROM forward_context_receipts').get();assert.ok(stored.raw_receipts_json.length>stored.payload_json.length);
 const c=(await loadExtraContexts(env,'scalpstorm_xtreme',DAY,at))({instrument_key:key},at);
 assert.equal(c.priorOpeningVolumes.length,20);assert.equal(c.sectorKey,'NSE_INDEX|Nifty Bank');
 assert.equal((await loadExtraContexts(env,'scalpstorm_xtreme',DAY,at))({instrument_key:key},at-1),null);
});
test('qualified period fixture travels through journal, independent intent, later book and truthful risk reporting',async()=>{
 const {env}=fixture();await ensureSevenAccounts(env.DB,OPEN-86400000);
 const bars=Array.from({length:210},(_,i)=>{const close=i<198?80+i*.1:100-(i-198)*.1;return{day:new Date(Date.parse('2026-11-04T00:00:00Z')-(209-i)*86400000).toISOString().slice(0,10),open:close,high:close+1,low:close-1,close}});
 const item=symbol=>({symbol,instrumentKey:symbol==='NIFTYBEES'?'NSE_EQ|INF204KB14I2':'NSE_EQ|INF204KB17I5',knownAt:OPEN-3600000,sourceSha256:SHA,adjustment:{status:'PROVIDER_DECLARED_SPLIT_BONUS',evidenceSha256:SHA,dividendAdjusted:false,independentlyReconciled:false},bars});
 const context={day:DAY,previousSession:'2026-11-04',firstSessionOfMonth:false,calendarSha256:SHA,calendarKnownAt:OPEN-3600000,series:['NIFTYBEES','GOLDBEES'].map(item)};
 const state=await loadSevenAccount(env.DB,'rsi2_snapback');
 assert.equal(periodDecisions(state.strategyId,state,context,OPEN+60000).decisions[0].side,'BUY');
 const result=await runPeriodForward(env,DAY,OPEN+60000,{readInput:async()=>({ready:true,context})});
 assert.equal(result.results[0].actions[0].status,'PENDING');
 const retry=await runPeriodForward(env,DAY,OPEN+60500,{readInput:async()=>({ready:true,context})});assert.equal(retry.results[0].actions[0].status,'DUPLICATE_SIGNAL');
 const now=OPEN+61000,key=item('NIFTYBEES').instrumentKey,q={source:'Upstox Analytics',instrumentKey:key,providerAt:new Date(now).toISOString(),observedAt:new Date(now).toISOString(),sourceKnownAt:now,ask:{price:100,quantity:1000},bid:{price:99.9,quantity:1000},sourceSha256:SHA};
 assert.equal((await tickSevenForward(env,now,async()=>new Map([[key,q]]),()=>now,{strategyId:'rsi2_snapback'})).fills,1);
 const report=paperExperimentReport(await loadSevenAccount(env.DB,'rsi2_snapback'));assert.equal(report.currentRiskPolicy.version,PERIOD_POLICY.version);assert.equal(report.openPositions.length,1);assert.equal(report.unrealizedPnlINR,null);
});

test('default period source adapter verifies archive bytes, prior session and preopen calendar while preserving declared-only status',async()=>{
 const {sql,env}=fixture();sql.exec(readFileSync(new URL('../etf-daily-history.sql',import.meta.url),'utf8'));
 const nextDay='2026-11-06',nextOpen=Date.parse(nextDay+'T03:45:00Z');
 const prior='2026-11-05',priorTime=Date.parse(prior+'T14:30:00Z');
 const candles=Array.from({length:210},(_,i)=>{const close=i<198?80+i*.1:100-(i-198)*.1;return[new Date(Date.parse(prior+'T00:00:00Z')-(209-i)*86400000).toISOString().slice(0,10)+'T00:00:00+05:30',close,close+1,close-1,close,10000,0]});
 const fetcher=async url=>new Response(JSON.stringify(url.includes('corporate-actions')?{status:'success',data:[]}:{status:'success',data:{candles}}),{status:200});
 for(const symbol of ['NIFTYBEES','GOLDBEES'])await archiveEtfDaily(env,{day:prior,symbol},fetcher,()=>priorTime);
 const holidays={status:'success',data:Array.from({length:10},(_,i)=>({date:'2026-01-'+String(i+1).padStart(2,'0'),closed_exchanges:['NSE'],open_exchanges:[]}))};
 await collectPeriodCalendar(env,nextDay,{fetcher:async()=>new Response(JSON.stringify(holidays),{status:200}),clock:()=>nextOpen-3600000});
 const source=await readQualifiedPeriodInputs(env,nextDay);assert.equal(source.ready,true);assert.equal(source.context.previousSession,prior);
 assert.ok(source.context.series.every(s=>s.adjustment.status==='PROVIDER_DECLARED_SPLIT_BONUS'&&s.adjustment.dividendAdjusted===false&&s.adjustment.independentlyReconciled===false));
 await ensureSevenAccounts(env.DB,nextOpen-86400000);
 const result=await runPeriodForward(env,nextDay,nextOpen+60000);
 assert.equal(result.results[0].actions[0].status,'PENDING');
 assert.equal((await readQualifiedPeriodInputs(env,'2026-11-09')).ready,false);
 sql.prepare("UPDATE etf_daily_receipts SET historical_body='corrupt' WHERE symbol='NIFTYBEES'").run();
 assert.equal((await readQualifiedPeriodInputs(env,nextDay)).ready,false);
});
