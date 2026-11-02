/** Retrospective, ten-name cohort comparison. Never a live 09:40 certification. */
import {COHORT_SYMBOLS,cohortSpec} from './upstox-history-cohort.js';

const CAPITAL_PAISE=10000000,ENTRY='09:41',EXIT='15:16';
const fail=reason=>{throw Error('HISTORY_BACKTEST_BLOCKED: '+reason);};
const sha256=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const pricePaise=x=>Math.round(x*100);

export async function scoreCohortDay(day,rows){
 try{cohortSpec({source_date:day,symbol:COHORT_SYMBOLS[0]})}catch{fail('invalid source date')}
 if(!Array.isArray(rows)||rows.length!==COHORT_SYMBOLS.length)fail('incomplete dated cohort');
 const byKey=new Map(rows.map(r=>[r.instrument_key,r]));
 if(byKey.size!==COHORT_SYMBOLS.length)fail('duplicate cohort identity');
 const features=[];
 for(const symbol of COHORT_SYMBOLS){
  const spec=cohortSpec({source_date:day,symbol}),r=byKey.get(spec.key);
  if(!r||r.source_date!==day||![spec.url,spec.intradayUrl].includes(r.source_url)||
   typeof r.response_body!=='string'||typeof r.body_sha256!=='string'||
   typeof r.known_at_utc!=='string'||Date.parse(r.known_at_utc)<Date.parse(day+'T10:30:00Z'))fail('source identity or publication time mismatch');
  const bytes=new TextEncoder().encode(r.response_body);
  if(bytes.length!==r.body_bytes||await sha256(bytes)!==r.body_sha256)fail('source body receipt mismatch');
  let parsed;try{parsed=JSON.parse(r.response_body)}catch{fail('invalid source JSON')}
  if(parsed?.status!=='success')fail('source status mismatch');
  const candles=parsed?.data?.candles;
  if(!Array.isArray(candles)||candles.length!==375)fail('incomplete minute coverage');
  const bars=new Map();
  for(const c of candles){
   if(!Array.isArray(c)||c.length<6||typeof c[0]!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:00\+05:30$/.test(c[0])||c[0].slice(0,10)!==day||bars.has(c[0].slice(11,16)))fail('invalid minute identity');
   const clock=c[0].slice(11,16),[open,high,low,close,volume]=c.slice(1,6);
   if(!/^\d\d:\d\d$/.test(clock)||![open,high,low,close].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0)||
    high<Math.max(open,close,low)||low>Math.min(open,close,high)||!Number.isSafeInteger(volume)||volume<0)fail('invalid minute OHLCV');
   bars.set(clock,{open,close,volume});
  }
  let cumVolume=0;
  for(let minute=555;minute<=929;minute++){
   const clock=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
   const bar=bars.get(clock);if(!bar)fail('missing minute bar');
   if(minute<=579)cumVolume+=bar.volume;
  }
  const first=bars.get('09:15'),decision=bars.get('09:39'),entry=bars.get(ENTRY),exit=bars.get(EXIT);
  features.push({symbol,cumulative_volume_0939:cumVolume,momentum_bps:Math.round((decision.close/first.open-1)*10000),entry_paise:pricePaise(entry.open),exit_paise:pricePaise(exit.open),body_sha256:r.body_sha256});
 }
 features.sort((a,b)=>b.cumulative_volume_0939-a.cumulative_volume_0939||a.symbol.localeCompare(b.symbol));
 return {source_date:day,evidence_class:'RETROSPECTIVE_COHORT_ONLY_NOT_FULL_MIS_0940',
  known_at:'AFTER_SESSION',decision_cutoff:'09:39 minute close',entry_model:'09:41 minute open',exit_model:'15:16 minute open for 15:15 scheduled exit',
  roster_sha256:cohortSpec({source_date:day,symbol:'NHPC'}).roster,
  roster_provenance:cohortSpec({source_date:day,symbol:'NHPC'}).roster?'PREMARKET_ROSTER_SHA256':'FIXED_WATCHLIST_IDENTITY_ONLY_NO_DATED_ROSTER',eligible_count:features.length,
  top_volume:features.map(({symbol,cumulative_volume_0939,momentum_bps})=>({symbol,cumulative_volume_0939,momentum_bps})),
  strategies:[
   score('VOLUME_TOP_1',features.slice(0,1)),
   score('VOLUME_TOP_3',features.slice(0,3)),
   score('VOLUME_POSITIVE_MOMENTUM_TOP_3',features.filter(x=>x.momentum_bps>0).slice(0,3)),
  ]};
}

function score(name,selected){
 if(!selected.length)return {name,status:'NO_TRADE',selected:[],trades:0,pnl_paise:0,return_bps:0,wins:0};
 const allocation=Math.floor(CAPITAL_PAISE/selected.length),trades=[];
 for(const x of selected){
  // 5 bps adverse slippage and 10 bps fee on each side. Integer paise.
  const buy=Math.ceil(x.entry_paise*10005/10000),sell=Math.floor(x.exit_paise*9995/10000);
  const qty=Math.floor(allocation/(buy*1.001));
  if(qty<1)fail('insufficient modeled capital');
  const buyFee=Math.ceil(qty*buy*10/10000),sellFee=Math.ceil(qty*sell*10/10000);
  const pnl=qty*sell-sellFee-qty*buy-buyFee;
  trades.push({symbol:x.symbol,qty,pnl_paise:pnl,entry_paise:buy,exit_paise:sell});
 }
 const pnl=trades.reduce((sum,t)=>sum+t.pnl_paise,0);
 return {name,status:'MODELED',selected:trades.map(x=>x.symbol),trades:trades.length,
  pnl_paise:pnl,return_bps:Math.round(pnl/CAPITAL_PAISE*10000),wins:trades.filter(x=>x.pnl_paise>0).length,
  cost_model:'5bps adverse slippage + 10bps fee on each side',fills:trades};
}

export async function readCohortBacktest(env,day){
 if(!env.HISTORY_DB)fail('archive unavailable');
 try{cohortSpec({source_date:day,symbol:COHORT_SYMBOLS[0]})}catch{fail('invalid source date')}
 const result=await env.HISTORY_DB.prepare('SELECT instrument_key,source_date,source_url,known_at_utc,body_sha256,body_bytes,response_body FROM history_samples WHERE source_date=? ORDER BY instrument_key').bind(day).all();
 return scoreCohortDay(day,result.results);
}
