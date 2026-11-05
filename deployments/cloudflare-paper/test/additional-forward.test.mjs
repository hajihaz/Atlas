import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {initializeExtra,advanceExtra,qualifyEarningsNews,EXTRA_METHODS} from '../src/forward-extra.js';
import {giftOpeningContext} from '../src/forward-context.js';
import {periodDecisions,wilderRsi2,atr14,PERIOD_POLICY} from '../src/forward-period.js';
import {createSevenAccount,submitSevenSignal,settleSevenPending,sevenRiskExit} from '../src/seven-paper-ledger.js';
import {ensureSevenAccounts,loadSevenAccount} from '../src/seven-paper-store.js';
import {queueForwardStrategy,tickSevenForward} from '../src/seven-forward-paper.js';
import {runPeriodForward} from '../src/forward-period-run.js';
const DAY='2026-11-05',OPEN=Date.parse(DAY+'T03:45:00Z'),SHA='a'.repeat(64),KEY='NSE_EQ|INE040A01034';
const seed=Array.from({length:25},(_,i)=>({time:OPEN+i*60000,open:100,high:101,low:99,close:100,volume:10000}));
const nifty=[{time:OPEN,open:100,knownAt:OPEN+60000,sourceSha256:SHA},{time:OPEN+14*60000,close:100.5,knownAt:OPEN+15*60000,sourceSha256:SHA}];
const window=(offset,close=103,low=102)=>Array.from({length:5},(_,i)=>({time:OPEN+(offset+i)*60000,knownAt:OPEN+(offset+i+1)*60000+1000,sourceSha256:SHA,open:102,high:Math.max(104,close),low,close,volume:1000}));
const ctx={sourceSha256:SHA,knownAt:OPEN-60000};
const gift={...ctx,method:EXTRA_METHODS.scalpstorm_x2,open:100,close:101,openTime:Date.parse(DAY+'T01:00:00Z'),closeTime:Date.parse(DAY+'T03:59:00Z')};
const headline={heading:'HDFC Bank Q2 results: net profit rises 15% YoY',article_link:'https://upstox.com/news/hdfc-results/',published_time:OPEN-3600000};
const db=s=>({prepare(sql){return{bind(...p){return{async first(){return s.prepare(sql).get(...p)||null},async all(){return{results:s.prepare(sql).all(...p)}},async run(){const r=s.prepare(sql).run(...p);return{meta:{changes:r.changes}}}}}}}});
const accountDb=()=>{const s=new DatabaseSync(':memory:');s.exec(readFileSync(new URL('../seven-paper-ledger.sql',import.meta.url),'utf8'));return s};
const historyDb=()=>{const s=new DatabaseSync(':memory:');s.exec("CREATE TABLE forward_strategy_windows(source_date TEXT,strategy_id TEXT,window_end_ms INTEGER,completed_ms INTEGER,status TEXT,payload_json TEXT,payload_sha256 TEXT,PRIMARY KEY(source_date,strategy_id,window_end_ms));");return s};
const digest=async x=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))).toString('hex');
const quote=(key,at,price=100,quantity=10000)=>({source:'Upstox Analytics',instrumentKey:key,providerAt:new Date(at).toISOString(),observedAt:new Date(at).toISOString(),sourceKnownAt:at,sourceSha256:SHA,bid:{price,quantity},ask:{price,quantity}});
test('GIFT qualification requires 180 contiguous morning candles known before entry',()=>{
 const from=Date.parse(DAY+'T01:00:00Z'),r={knownAt:OPEN+19*60000,body:{data:{candles:Array.from({length:180},(_,i)=>[new Date(from+i*60000).toISOString(),100,102,99,101,0])}}};
 const c=giftOpeningContext(r,DAY);assert.equal(c.open,100);assert.equal(c.close,101);assert.equal(c.sameContractCertified,false);
 assert.throws(()=>giftOpeningContext({...r,knownAt:OPEN+25*60000},DAY),/availability/);
 assert.throws(()=>giftOpeningContext({...r,body:{data:{candles:r.body.data.candles.slice(1)}}},DAY),/continuity/);
});
test('X2 signals only causal aligned GIFT/Nifty confirmed breaks, never a gap or warmup',()=>{
 const s=initializeExtra(DAY,'HDFCBANK',seed),w=window(25),now=w.at(-1).knownAt;
 assert.equal(advanceExtra('scalpstorm_x2',s,w,nifty,gift,now).decision.side,'BUY');
 assert.equal(advanceExtra('scalpstorm_x2',s,w,nifty,null,now).decision.reason,'GIFT_OPENING_SOURCE_UNQUALIFIED');
 assert.equal(advanceExtra('scalpstorm_x2',s,w,nifty,{...gift,knownAt:w[0].time+1},now).decision.status,'NO_TRADE');
 assert.equal(advanceExtra('scalpstorm_x2',s,w,nifty,gift,now,{warmup:true}).decision.status,'NO_TRADE');
 assert.throws(()=>advanceExtra('scalpstorm_x2',s,window(30),nifty,gift,now+300000),/discontinuous/);
});
test('news qualification rejects speculative, ambiguous, future and conflicting headlines',()=>{
 assert.equal(qualifyEarningsNews([headline],'HDFCBANK',OPEN,OPEN+60000).direction,'BUY');
 for(const h of ['HDFC Bank Q2 net profit expected rises 15% YoY','HDFC Bank Q2 net profit rises 5% YoY','Another Bank Q2 net profit rises 15% YoY','HDFC Bank rival Q2 net profit rises 15% YoY','HDFC Bank Q2 net profit rises 15% YoY but revenue falls']){
  assert.equal(qualifyEarningsNews([{...headline,heading:h}],'HDFCBANK',OPEN,OPEN+60000),null);
 }
 assert.equal(qualifyEarningsNews([headline],'HDFCBANK',OPEN+120000,OPEN+60000),null);
 assert.equal(qualifyEarningsNews([headline,{...headline,heading:'HDFC Bank Q2 net profit falls 25% YoY'}],'HDFCBANK',OPEN,OPEN+60000),null);
 assert.equal(qualifyEarningsNews([{...headline,published_time:OPEN+1}],'HDFCBANK',OPEN,OPEN+60000),null);
});
test('X3 requires a post-knowledge liquid price response in the earnings direction',()=>{
 const s=initializeExtra(DAY,'HDFCBANK',seed),w=window(25),now=w.at(-1).knownAt,news={...ctx,items:[headline]};
 assert.equal(advanceExtra('scalpstorm_x3',s,w,nifty,news,now).decision.side,'BUY');
 assert.equal(advanceExtra('scalpstorm_x3',{...s,openingVolume:9999},w,nifty,news,now).decision.status,'NO_TRADE');
 assert.equal(advanceExtra('scalpstorm_x3',s,w,nifty,{...news,knownAt:w[0].time+1},now).decision.status,'NO_TRADE');
});
test('Xtreme requires 20 prior same-time sessions and distinct breakout, retest, resume windows',()=>{
 const priorOpeningVolumes=Array.from({length:20},(_,i)=>({day:new Date(OPEN-(25-i)*86400000).toISOString().slice(0,10),volume:100000}));
 const c={...ctx,method:EXTRA_METHODS.scalpstorm_xtreme,priorOpeningVolumes,sectorBps:10,sectorSourceSha256:SHA,sectorKey:'NSE_INDEX|Nifty Bank'};
 let s=initializeExtra(DAY,'HDFCBANK',seed);
 for(const [offset,low,status] of [[25,102,'NO_TRADE'],[30,101,'NO_TRADE'],[35,102,'SIGNAL']]){
  const w=window(offset,103,low),r=advanceExtra('scalpstorm_xtreme',s,w,nifty,c,w.at(-1).knownAt);assert.equal(r.decision.status,status);s=r.state;
 }
 const w=window(25);
 assert.equal(advanceExtra('scalpstorm_xtreme',initializeExtra(DAY,'HDFCBANK',seed),w,nifty,{...c,priorOpeningVolumes:priorOpeningVolumes.slice(1)},w.at(-1).knownAt).decision.reason,'RVOL20_OR_SECTOR_SOURCE_UNQUALIFIED');
});
const daily=(lastDay,up=true)=>Array.from({length:210},(_,i)=>{const close=up?80+i*.1:120-i*.1;return{day:new Date(Date.parse(lastDay+'T00:00:00Z')-(209-i)*86400000).toISOString().slice(0,10),open:close,high:close+1,low:close-1,close,volume:10000}});
const periodContext=(day=DAY,previousSession='2026-11-04',firstSessionOfMonth=false)=>({day,previousSession,firstSessionOfMonth,calendarSha256:SHA,calendarKnownAt:Date.parse(day+'T03:00:00Z'),series:['NIFTYBEES','GOLDBEES'].map((symbol,i)=>({symbol,instrumentKey:i?'NSE_EQ|INF204KB17I5':'NSE_EQ|INF204KB14I2',knownAt:Date.parse(day+'T02:00:00Z'),sourceSha256:SHA,adjustment:{status:'VERIFIED_SPLIT_DIVIDEND_ADJUSTED',evidenceSha256:SHA},bars:daily(previousSession,i===0)}))});
test('Wilder RSI and ATR have deterministic warmup and flat-price behavior',()=>{
 assert.equal(wilderRsi2([{close:1},{close:2},{close:3},{close:2}]),50);
 assert.equal(wilderRsi2([{close:1},{close:1},{close:1}]),50);
 assert.ok(Math.abs(atr14(daily('2026-11-04'))-2)<1e-10);
});
test('period entries reject raw, future-known and stale prior-session data',()=>{
 const s=createSevenAccount('rsi2_snapback',OPEN-86400000),c=periodContext();
 assert.equal(periodDecisions(s.strategyId,s,c,OPEN+60000).status,'NO_TRADE');
 const raw=structuredClone(c);raw.series[0].adjustment.status='RAW_UNADJUSTED';
 assert.throws(()=>periodDecisions(s.strategyId,s,raw,OPEN+60000),/adjusted source/);
 const future=structuredClone(c);future.series[0].knownAt=OPEN+1;
 assert.throws(()=>periodDecisions(s.strategyId,s,future,OPEN+60000),/adjusted source/);
 assert.throws(()=>periodDecisions(s.strategyId,s,{...c,previousSession:'2026-11-03'},OPEN+60000),/prior session/);
});
test('swing ATR sizing bounds modeled stop loss; overnight holdings do not get intraday liquidation or targets',()=>{
 let s=createSevenAccount('rsi2_snapback',OPEN-86400000),sig={strategyId:s.strategyId,id:'period-risk-long-00001',symbol:'NIFTYBEES',instrumentKey:'NSE_EQ|INF204KB14I2',side:'BUY',signalAt:new Date(OPEN).toISOString(),risk:{version:PERIOD_POLICY.version,stopDistancePaise:500},realOrdersEnabled:false};
 assert.throws(()=>submitSevenSignal(s,{...sig,risk:null},OPEN),/ATR risk/);
 assert.throws(()=>submitSevenSignal(s,{...sig,side:'SELL'},OPEN),/long only/);
 s=submitSevenSignal(s,sig,OPEN).state;s=settleSevenPending(s,'NIFTYBEES',quote(sig.instrumentKey,OPEN+1000),OPEN+1000).state;
 const p=s.positions.NIFTYBEES;assert.ok(p.qty*(500+31)<=25000);assert.equal(p.targetPaise,null);
 assert.equal(sevenRiskExit(s,'NIFTYBEES',null,OPEN+360*60000),null);
 assert.equal(sevenRiskExit(s,'NIFTYBEES',null,OPEN+86400000),null);
 const at=OPEN+86400000;assert.equal(sevenRiskExit(s,'NIFTYBEES',quote(sig.instrumentKey,at,90),at).reason,'RISK_STOP');
});
test('monthly rotation exits old exposure before buying and never repeats a filled monthly entry',()=>{
 const day='2026-12-01',open=Date.parse(day+'T03:45:00Z'),c=periodContext(day,'2026-11-30',true),s=createSevenAccount('dual_momentum_rotation',OPEN);
 const r=periodDecisions(s.strategyId,s,c,open+60000);assert.equal(r.decisions[0].symbol,'NIFTYBEES');assert.equal(r.decisions[0].side,'BUY');
 const held={...s,positions:{GOLDBEES:{qty:10,openedAt:OPEN}}};
 const rotate=periodDecisions(s.strategyId,held,c,open+60000);assert.equal(rotate.decisions.length,1);assert.equal(rotate.decisions[0].side,'SELL');
 assert.equal(periodDecisions(s.strategyId,s,{...c,firstSessionOfMonth:false},open+60000).decisions.length,0);
 const filled={...s,fills:[{positionEffect:'OPEN',tradeAt:open}]};
 assert.equal(periodDecisions(s.strategyId,filled,c,open+60000).decisions.length,0);
});
test('period orchestration journals raw-source block without creating any paper intent',async()=>{
 const a=accountDb(),h=historyDb(),env={DB:db(a),HISTORY_DB:db(h)};await ensureSevenAccounts(env.DB,OPEN-86400000);
 const r=await runPeriodForward(env,DAY,OPEN+60000,{readInput:async()=>({ready:false,reason:'ADJUSTED_SOURCE_UNCONFIRMED',sources:[]})});
 assert.ok(r.results.every(x=>x.status==='BLOCKED'));
 assert.equal(h.prepare('SELECT COUNT(*) n FROM forward_strategy_windows').get().n,2);
 assert.equal(Object.keys((await loadSevenAccount(env.DB,'rsi2_snapback')).pending).length,0);
});
test('all three added intraday journals queue once, fill from a later book and request 15:15 exits',async()=>{
 for(const strategyId of ['scalpstorm_x2','scalpstorm_x3','scalpstorm_xtreme']){
  const a=accountDb(),h=historyDb(),env={DB:db(a),HISTORY_DB:db(h)};await ensureSevenAccounts(env.DB,OPEN-60000);
  const end=OPEN+29*60000,now=end+3*60000;
  const decisions=Array.from({length:10},(_,i)=>({strategyId,sourceDate:DAY,symbol:i?'S'+i:'HDFCBANK',instrumentKey:KEY,status:i?'NO_TRADE':'SIGNAL',side:i?null:'BUY',reason:'TEST_QUALIFIED_BREAK',methodVersion:EXTRA_METHODS[strategyId],contextSha256:SHA,barEndedAt:new Date(end+60000).toISOString(),sourceSha256:Array(5).fill(SHA)}));
  const payload=JSON.stringify({decisions});h.prepare('INSERT INTO forward_strategy_windows VALUES(?,?,?,?,?,?,?)').run(DAY,strategyId,end,now-1,'EVALUATED',payload,await digest(payload));
  assert.equal((await queueForwardStrategy(env,strategyId,DAY,end,now)).queued,1);assert.equal((await queueForwardStrategy(env,strategyId,DAY,end,now)).queued,0);
  assert.equal((await tickSevenForward(env,now+1000,async()=>new Map([[KEY,quote(KEY,now+1000)]]),()=>now+1000,{strategyId})).fills,1);
  const close=OPEN+360*60000;assert.equal((await tickSevenForward(env,close,async()=>new Map(),()=>close,{strategyId,followUp:false})).exits,1);
 }
});
