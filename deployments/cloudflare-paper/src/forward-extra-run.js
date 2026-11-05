/** Additional variants share the same hashed completed-minute archive as X/VWAP. */
import {EXTRA_INTRADAY,initializeExtra,advanceExtra} from './forward-extra.js';
import {loadExtraContexts} from './forward-context.js';
const digest=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const fail=r=>{const e=Error('EXTRA_FORWARD_RUN_BLOCKED: '+r);e.atlasDiagnostic='extra forward '+r;throw e};
export async function runAdditionalForward(env,day,windowEnd,now,input){
 const results=[];
 for(const strategyId of EXTRA_INTRADAY){
  try{results.push({strategyId,...await runOne(env,strategyId,day,windowEnd,now,input)})}
  catch(e){const payload=JSON.stringify({reason:String(e?.atlasDiagnostic||'EXTRA_INPUT_UNAVAILABLE').slice(0,120)});
   await env.HISTORY_DB.prepare("INSERT OR IGNORE INTO forward_strategy_windows(source_date,strategy_id,window_end_ms,completed_ms,status,payload_json,payload_sha256) VALUES(?,?,?,?,'SKIPPED',?,?)").bind(day,strategyId,windowEnd,now,payload,await digest(payload)).run();
   results.push({strategyId,status:'SKIPPED'});
  }
 }return results;
}
async function runOne(env,strategyId,day,windowEnd,now,input){
 if(new Date(now+19800000).toISOString().slice(0,10)!==day||!Number.isSafeInteger(windowEnd)||now-windowEnd<60000||now-windowEnd>240000||
  input?.roster?.day!==day||input.roster.eligibleCount<500||input.roster.knownAt>=Date.parse(day+'T04:11:00Z')||!Array.isArray(input.top)||input.top.length!==10)fail('dated decision clock or roster');
 const db=env.HISTORY_DB;
 const existing=await db.prepare('SELECT status FROM forward_strategy_windows WHERE source_date=? AND strategy_id=? AND window_end_ms=?').bind(day,strategyId,windowEnd).first();if(existing)return {status:'VERIFIED_EXISTING'};
 const prior=await db.prepare("SELECT window_end_ms,payload_json,payload_sha256 FROM forward_strategy_windows WHERE source_date=? AND strategy_id=? AND status='EVALUATED' ORDER BY window_end_ms DESC LIMIT 1").bind(day,strategyId).first();
 let states={},start=Date.parse(day+'T04:10:00Z');
 if(prior){if(await digest(prior.payload_json)!==prior.payload_sha256)fail('indicator proof');states=JSON.parse(prior.payload_json).states;start=prior.window_end_ms+60000}
 else for(const stock of input.top)states[stock.symbol]=initializeExtra(day,stock.symbol,input.seedMap.get(stock.instrument_key));
 if(windowEnd-start<0||(windowEnd-start)%300000!==240000||windowEnd-start>=1800000)fail('bounded indicator continuity');
 const url=new URL('https://api.upstox.com/v3/market-quote/ohlc');url.searchParams.set('instrument_key',input.top.map(x=>x.instrument_key).join(','));url.searchParams.set('interval','I1');
 const rows=(await db.prepare('SELECT bar_ms,known_at_ms,source_url,body_sha256,bars_json FROM live_minute_receipts WHERE source_date=? AND bar_ms BETWEEN ? AND ? ORDER BY bar_ms').bind(day,start,windowEnd).all()).results;
 if(rows.length!==(windowEnd-start)/60000+1)fail('captured minute gap');
 const bySymbol=new Map(input.top.map(x=>[x.symbol,[]]));
 for(const [i,r] of rows.entries()){
  if(r.bar_ms!==start+i*60000||r.known_at_ms>now||r.source_url!==url.toString()||await digest(r.bars_json)!==r.body_sha256)fail('minute source proof');
  const bars=JSON.parse(r.bars_json);if(bars.length!==10)fail('minute roster');
  for(let j=0;j<10;j++){const b=bars[j],stock=input.top[j];if(b[0]!==stock.symbol||b[1]!==stock.instrument_key)fail('stock identity');
   bySymbol.get(stock.symbol).push({time:r.bar_ms,knownAt:r.known_at_ms,sourceSha256:r.body_sha256,open:b[2],high:b[3],low:b[4],close:b[5],volume:b[6]});}
 }
 const decisions=[],contextFor=await loadExtraContexts(env,strategyId,day,now);
 for(const stock of input.top){
  const bars=bySymbol.get(stock.symbol);let result;
  if(!states[stock.symbol])fail('indicator missing');
  for(let offset=0;offset<bars.length;offset+=5){
   const window=bars.slice(offset,offset+5),context=contextFor(stock,window[0].time);
   result=advanceExtra(strategyId,states[stock.symbol],window,input.nifty,context,now,{warmup:offset+5<bars.length});states[stock.symbol]=result.state;
  }
  decisions.push({...result.decision,instrumentKey:stock.instrument_key});
 }
 const payload=JSON.stringify({states,decisions});
 await db.prepare("INSERT OR IGNORE INTO forward_strategy_windows(source_date,strategy_id,window_end_ms,completed_ms,status,payload_json,payload_sha256) VALUES(?,?,?,?,'EVALUATED',?,?)").bind(day,strategyId,windowEnd,now,payload,await digest(payload)).run();
 return {status:'EVALUATED',signals:decisions.filter(d=>d.status==='SIGNAL').length};
}
