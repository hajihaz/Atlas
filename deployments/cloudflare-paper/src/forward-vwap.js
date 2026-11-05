/** Incremental, completed-bar VWAP/EMA9 research. Never reads a future candle. */
const fail=reason=>{const e=Error('FORWARD_VWAP_BLOCKED: '+reason);e.atlasDiagnostic='forward vwap '+reason;throw e;};
const valid=b=>b&&Number.isSafeInteger(b.time)&&[b.open,b.high,b.low,b.close].every(n=>Number.isFinite(n)&&n>0)&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close)&&Number.isSafeInteger(b.volume)&&b.volume>=0;
const digest=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export function initializeVwap(day,symbol,seed){
 const open=Date.parse(day+'T03:45:00Z');
 if(!/^[A-Z][A-Z0-9]{0,19}$/.test(symbol)||!Array.isArray(seed)||seed.length!==25||seed.some((b,i)=>!valid(b)||b.time!==open+i*60000))fail('opening seed missing');
 let volume=0,pv=0;for(const b of seed){volume+=b.volume;pv+=(b.high+b.low+b.close)/3*b.volume;}
 return {day,symbol,lastTime:seed[24].time,volume,pv,count:5,closes:seed.filter((_,i)=>i%5===4).map(b=>b.close),ema:null,previous:{...seed[24],vwap:volume?pv/volume:null}};
}
export function advanceVwap(previous,window,nifty,now,{warmup=false}={}){
 const state=structuredClone(previous),open=Date.parse(state.day+'T03:45:00Z');
 if(!Array.isArray(window)||window.length!==5||window.some((b,i)=>!valid(b)||b.time!==state.lastTime+(i+1)*60000||b.knownAt>now||b.knownAt<b.time+60000||b.knownAt>b.time+120000||!Number.isSafeInteger(b.knownAt)||!/^[a-f0-9]{64}$/.test(b.sourceSha256||''))||window[4].time+60000>now||(!warmup&&now-window[4].knownAt>120000))fail('source gap or stale window');
 if(!Array.isArray(nifty)||nifty.length!==2||nifty[0].time!==open||nifty[1].time!==open+14*60000||![nifty[0].open,nifty[1].close].every(x=>Number.isFinite(x)&&x>0)||nifty.some(b=>!Number.isSafeInteger(b.knownAt)||b.knownAt>now||b.knownAt>=open+25*60000||!/^[a-f0-9]{64}$/.test(b.sourceSha256||'')))fail('Nifty source missing');
 const prior=state.previous,priorEma=state.ema,last=window[4];
 for(const b of window){state.volume+=b.volume;state.pv+=(b.high+b.low+b.close)/3*b.volume;}
 state.count++;state.closes.push(last.close);
 if(state.count===9)state.ema=state.closes.reduce((a,b)=>a+b,0)/9;
 else if(state.count>9)state.ema=priorEma*.8+last.close*.2;
 if(state.closes.length>9)state.closes=state.closes.slice(-9);
 const vwap=state.volume?state.pv/state.volume:null,niftyBps=Math.round((nifty[1].close/nifty[0].open-1)*10000);
 const near=prior.vwap>0&&priorEma>0?Math.min(Math.abs(prior.close-prior.vwap)/prior.vwap,Math.abs(prior.close-priorEma)/priorEma):Infinity;
 const ready=!warmup&&last.time>=open+49*60000&&priorEma!=null&&state.ema>priorEma&&vwap>prior.vwap&&last.close>state.ema&&last.close>vwap&&near<=.003&&last.close>prior.high&&niftyBps>=20;
 state.lastTime=last.time;state.previous={...last,vwap};
 return {state,decision:{strategyId:'vwap_precision',sourceDate:state.day,symbol:state.symbol,status:ready?'SIGNAL':'NO_TRADE',side:ready?'BUY':null,reason:ready?'VWAP_EMA_PULLBACK':warmup?'INDICATOR_WARMUP':niftyBps<20?'NIFTY_NOT_BULLISH':'NO_CONFIRMED_PULLBACK',barEndedAt:new Date(last.time+60000).toISOString(),sourceSha256:window.map(b=>b.sourceSha256),evidenceClass:'FORWARD_COMPLETED_SOURCE_ONLY',paperOnly:true,realOrdersEnabled:false}};
}
export async function runForwardVwap(env,day,windowEnd,now,input){
 if(new Date(now+19800000).toISOString().slice(0,10)!==day||!Number.isSafeInteger(windowEnd)||now-windowEnd<60000||now-windowEnd>240000||input?.roster?.day!==day||input.roster.eligibleCount<500||input.roster.knownAt>=Date.parse(day+'T04:11:00Z')||!Array.isArray(input.top)||input.top.length!==10)fail('dated roster or decision clock');
 const db=env.HISTORY_DB;
 const existing=await db.prepare('SELECT status FROM forward_strategy_windows WHERE source_date=? AND strategy_id=? AND window_end_ms=?').bind(day,'vwap_precision',windowEnd).first();
 if(existing)return {status:'VERIFIED_EXISTING'};
 const prior=await db.prepare("SELECT window_end_ms,payload_json,payload_sha256 FROM forward_strategy_windows WHERE source_date=? AND strategy_id=? AND status='EVALUATED' ORDER BY window_end_ms DESC LIMIT 1").bind(day,'vwap_precision').first();
 const sourceUrl=new URL('https://api.upstox.com/v3/market-quote/ohlc');sourceUrl.searchParams.set('instrument_key',input.top.map(s=>s.instrument_key).join(','));sourceUrl.searchParams.set('interval','I1');
 let states={},start=Date.parse(day+'T04:10:00Z');
 if(prior){
  if(await digest(prior.payload_json)!==prior.payload_sha256)fail('stored indicator proof changed');
  states=JSON.parse(prior.payload_json).states;start=prior.window_end_ms+60000;
 }else for(const stock of input.top)states[stock.symbol]=initializeVwap(day,stock.symbol,input.seedMap.get(stock.instrument_key));
 if(windowEnd-start<0||(windowEnd-start)%300000!==240000||windowEnd-start>=1800000)fail('indicator continuity exceeds bounded recovery');
 const rows=await db.prepare('SELECT bar_ms,known_at_ms,source_url,body_sha256,bars_json FROM live_minute_receipts WHERE source_date=? AND bar_ms BETWEEN ? AND ? ORDER BY bar_ms').bind(day,start,windowEnd).all();
 if(rows.results.length!==(windowEnd-start)/60000+1)fail('captured VWAP minutes missing');
 const bySymbol=new Map(input.top.map(s=>[s.symbol,[]]));
 for(const [i,r] of rows.results.entries()){
  if(r.bar_ms!==start+i*60000||r.source_url!==sourceUrl.toString()||r.known_at_ms>now||await digest(r.bars_json)!==r.body_sha256)fail('minute source proof changed');
  const bars=JSON.parse(r.bars_json);if(bars.length!==10)fail('minute roster incomplete');
  for(let j=0;j<10;j++){
   const b=bars[j],stock=input.top[j];if(b[0]!==stock.symbol||b[1]!==stock.instrument_key)fail('stock identity changed');
   bySymbol.get(stock.symbol).push({time:r.bar_ms,knownAt:r.known_at_ms,sourceSha256:r.body_sha256,open:b[2],high:b[3],low:b[4],close:b[5],volume:b[6]});
  }
 }
 const decisions=[];
 for(const stock of input.top){
  const bars=bySymbol.get(stock.symbol);let result;
  if(!states[stock.symbol])fail('indicator stock missing');
  for(let offset=0;offset<bars.length;offset+=5){result=advanceVwap(states[stock.symbol],bars.slice(offset,offset+5),input.nifty,now,{warmup:offset+5<bars.length});states[stock.symbol]=result.state;}
  decisions.push({...result.decision,instrumentKey:stock.instrument_key});
 }
 const payload=JSON.stringify({states,decisions});
 await db.prepare("INSERT OR IGNORE INTO forward_strategy_windows(source_date,strategy_id,window_end_ms,completed_ms,status,payload_json,payload_sha256) VALUES(?,?,?,?,'EVALUATED',?,?)").bind(day,'vwap_precision',windowEnd,now,payload,await digest(payload)).run();
 return {status:'EVALUATED',signals:decisions.filter(d=>d.status==='SIGNAL').length};
}

export async function recordVwapSkip(env,day,windowEnd,now,error){
 const reason=String(error?.atlasDiagnostic||'VWAP_INPUT_UNAVAILABLE').slice(0,120),payload=JSON.stringify({reason});
 try{await env.HISTORY_DB.prepare("INSERT OR IGNORE INTO forward_strategy_windows(source_date,strategy_id,window_end_ms,completed_ms,status,payload_json,payload_sha256) VALUES(?,?,?,?,'SKIPPED',?,?)").bind(day,'vwap_precision',windowEnd,now,payload,await digest(payload)).run();}
 catch{console.error('VWAP decision journal unavailable');}
}
