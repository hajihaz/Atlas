import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {COHORT_SYMBOLS,cohortSpec} from '../src/upstox-history-cohort.js';
import {scoreCohortDay} from '../src/history-backtest.js';

const DAY='2026-10-28';
function row(symbol,index,{lateVolume=false,missing=false,day=DAY,intraday=false}={}){
 const candles=[];
 for(let minute=555;minute<=929;minute++){
  if(missing&&minute===570)continue;
  const time=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
  const open=minute===916?(index===0?103:98):100;
  const close=minute===579?(index===0?101:99):open;
  const volume=minute<=579?(10-index)*1000:(lateVolume&&minute===580?1000000:100);
  candles.push([`${day}T${time}:00+05:30`,open,Math.max(open,close)+1,Math.min(open,close)-1,close,volume,0]);
 }
 const body=JSON.stringify({status:'success',data:{candles}}),spec=cohortSpec({source_date:day,symbol});
 return {instrument_key:spec.key,source_date:day,source_url:intraday?spec.intradayUrl:spec.url,known_at_utc:day+'T10:31:00Z',
  body_sha256:createHash('sha256').update(body).digest('hex'),body_bytes:Buffer.byteLength(body),response_body:body};
}
const rows=opts=>COHORT_SYMBOLS.map((symbol,index)=>row(symbol,index,opts));

test('retrospective cohort uses only completed 09:39 information and later modeled fills',async()=>{
 const base=await scoreCohortDay(DAY,rows());
 assert.equal(base.eligible_count,10);
 assert.equal(base.top_volume[0].symbol,'AXISBANK');
 assert.deepEqual(base.strategies.map(x=>x.name),['VOLUME_TOP_1','VOLUME_TOP_3','VOLUME_POSITIVE_MOMENTUM_TOP_3']);
 assert.deepEqual(base.strategies.map(x=>x.trades),[1,3,1]);
 assert.ok(base.strategies[0].pnl_paise>0);
 assert.equal(base.strategies[0].fills[0].entry_paise,10005);
 assert.equal(base.strategies[0].fills[0].exit_paise,10294);
 const changed=await scoreCohortDay(DAY,rows({lateVolume:true}));
 assert.deepEqual(changed.top_volume,base.top_volume);
 assert.deepEqual(changed.strategies,base.strategies);
});

test('incomplete or altered historical receipts fail before scoring',async()=>{
 await assert.rejects(scoreCohortDay(DAY,rows().slice(1)),/incomplete dated cohort/);
 await assert.rejects(scoreCohortDay(DAY,rows({missing:true})),/incomplete minute coverage/);
 const broken=rows();broken[0].response_body+=' ';
 await assert.rejects(scoreCohortDay(DAY,broken),/source body receipt mismatch/);
});

test('same-day intraday receipts and future fixed cohort remain scoreable with honest provenance',async()=>{
 const current=await scoreCohortDay('2026-10-30',rows({day:'2026-10-30',intraday:true}));
 assert.equal(current.eligible_count,10);
 assert.equal(current.roster_provenance,'PREMARKET_ROSTER_SHA256');
 const future=await scoreCohortDay('2026-11-02',rows({day:'2026-11-02',intraday:true}));
 assert.equal(future.eligible_count,10);
 assert.equal(future.roster_sha256,null);
 assert.equal(future.roster_provenance,'FIXED_WATCHLIST_IDENTITY_ONLY_NO_DATED_ROSTER');
 await assert.rejects(scoreCohortDay('2026-10-27',rows()),/invalid source date/);
});
