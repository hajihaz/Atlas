/** Causal five-minute drivers for the three additional intraday variants. */
const fail=r=>{const e=Error('EXTRA_FORWARD_BLOCKED: '+r);e.atlasDiagnostic='extra forward '+r;throw e};
const sha=x=>/^[a-f0-9]{64}$/.test(x||'');
export const EXTRA_INTRADAY=Object.freeze(['scalpstorm_x2','scalpstorm_x3','scalpstorm_xtreme']);
export const EXTRA_METHODS=Object.freeze({scalpstorm_x2:'GIFT_ROLLING_120S_OPENING_V1',scalpstorm_x3:'QUANTIFIED_YOY_NET_PROFIT_HEADLINES_V1',scalpstorm_xtreme:'RVOL20_SECTOR_RETEST_V1'});
const aliases={ASHOKLEY:'Ashok Leyland',HDFCBANK:'HDFC Bank',IDEA:'Vodafone Idea',JPPOWER:'Jaiprakash Power',NHPC:'NHPC',PCJEWELLER:'PC Jeweller',SUZLON:'Suzlon',YESBANK:'Yes Bank',EQUITASBNK:'Equitas Small Finance Bank'};
const clean=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
export function qualifyEarningsNews(items,symbol,knownAt,windowStart){
 if(!Array.isArray(items)||!Number.isSafeInteger(knownAt)||knownAt>windowStart)return null;
 const alias=aliases[symbol];if(!alias)return null;
 const qualified=[];
 for(const n of items){
  if(!Number.isSafeInteger(n.published_time)||n.published_time>knownAt||windowStart-n.published_time>86400000||
   typeof n.heading!=='string'||typeof n.article_link!=='string'||!/^https:\/\/[^/]+\//.test(n.article_link))continue;
  const h=n.heading.toLowerCase().replace(/\s+/g,' ');
  // Company name must directly introduce quarterly results, not a rival or analyst story.
  const subject=h.startsWith(alias.toLowerCase())?h.slice(alias.length).replace(/^[ :,-]+/,''):'';
  if(!/^q[1-4]\b/.test(subject))continue;
  if(!clean(h).startsWith(clean(alias))||!/\bq[1-4]\b/.test(h)||!/\b(yoy|year.on.year)\b/.test(h)||
   /\b(rumou?r|expect\w*|forecast\w*|estimate\w*|may|could|loss\w*|but|however|despite)\b/.test(h))continue;
  const matches=[...h.matchAll(/net profit\s+(rises|jumps|surges|climbs|up|falls|drops|declines|slumps|down)\s+(\d+(?:\.\d+)?)\s*%/g)];
  if(matches.length!==1||Number(matches[0][2])<10||Number(matches[0][2])>1000)continue;
  qualified.push({direction:['rises','jumps','surges','climbs','up'].includes(matches[0][1])?'BUY':'SELL',publishedAt:n.published_time,knownAt,articleLink:n.article_link,heading:n.heading});
 }
 if(!qualified.length||new Set(qualified.map(x=>x.direction)).size!==1)return null;
 return qualified.sort((a,b)=>b.publishedAt-a.publishedAt)[0];
}
export function initializeExtra(day,symbol,seed){
 const open=Date.parse(day+'T03:45:00Z');
 if(!Array.isArray(seed)||seed.length!==25||seed.some((b,i)=>b.time!==open+i*60000||
  ![b.open,b.high,b.low,b.close].every(x=>Number.isFinite(x)&&x>0)||!Number.isSafeInteger(b.volume)||b.volume<0||
  b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)))fail('opening seed');
 return {day,symbol,lastTime:seed[24].time,openingPrice:seed[0].open,openingHigh:Math.max(...seed.map(b=>b.high)),openingLow:Math.min(...seed.map(b=>b.low)),openingVolume:seed.reduce((s,b)=>s+b.volume,0),breakSide:null,retested:false};
}
export function advanceExtra(strategyId,previous,window,nifty,context,now,{warmup=false}={}){
 if(!EXTRA_INTRADAY.includes(strategyId))fail('strategy');
 const state=structuredClone(previous),open=Date.parse(state.day+'T03:45:00Z');
 if(!Array.isArray(window)||window.length!==5||window.some((b,i)=>b.time!==state.lastTime+(i+1)*60000||
  !Number.isSafeInteger(b.knownAt)||b.knownAt<b.time+60000||b.knownAt>b.time+120000||b.knownAt>now||!sha(b.sourceSha256)||
  ![b.open,b.high,b.low,b.close].every(x=>Number.isFinite(x)&&x>0)||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||
  !Number.isSafeInteger(b.volume)||b.volume<0)||(!warmup&&now-window[4].knownAt>120000))fail('noncausal or discontinuous minutes');
 if(!Array.isArray(nifty)||nifty.length!==2||nifty[0].time!==open||nifty[1].time!==open+14*60000||
  ![nifty[0].open,nifty[1].close].every(x=>Number.isFinite(x)&&x>0)||
  nifty.some(b=>!Number.isSafeInteger(b.knownAt)||b.knownAt>=open+25*60000||b.knownAt>now||!sha(b.sourceSha256)))fail('Nifty opening');
 const first=window[0],last=window[4],nb=(nifty[1].close/nifty[0].open-1)*10000;
 const buy=last.close>state.openingHigh&&last.close>first.open,sell=last.close<state.openingLow&&last.close<first.open;
 let side=null,reason='NO_CONFIRMED_BREAKOUT',evidence=null;
 const contextReady=context&&sha(context.sourceSha256)&&Number.isSafeInteger(context.knownAt)&&context.knownAt<=first.time;
 if(strategyId==='scalpstorm_x2'){
  if(!contextReady||context.method!==EXTRA_METHODS.scalpstorm_x2||!Number.isFinite(context.open)||!Number.isFinite(context.close)||context.open<=0||context.close<=0||
   context.openTime!==Date.parse(state.day+'T01:00:00Z')||context.closeTime!==Date.parse(state.day+'T03:59:00Z')||context.knownAt>=open+25*60000)reason='GIFT_OPENING_SOURCE_UNQUALIFIED';
  else {const gb=(context.close/context.open-1)*10000;
   side=gb>=20&&nb>=20&&buy?'BUY':gb<=-20&&nb<=-20&&sell?'SELL':null;
   reason=side?'GIFT_NIFTY_BREAKOUT':'GIFT_NIFTY_NO_CONFIRMED_ALIGNMENT';evidence={giftBps:gb,niftyBps:nb,declaredLatencySeconds:120,sameContractCertified:false};}
 }else if(strategyId==='scalpstorm_x3'){
  const news=contextReady?qualifyEarningsNews(context.items,state.symbol,context.knownAt,first.time):null;
  if(!news)reason='NO_QUALIFIED_EARNINGS_HEADLINE';
  else {side=state.openingVolume>=10000&&(news.direction==='BUY'&&buy||news.direction==='SELL'&&sell)?news.direction:null;
   reason=side?'EARNINGS_PRICE_RESPONSE':'NO_LIQUID_NEWS_PRICE_CONFIRMATION';evidence=news;}
 }else{
  const volumes=context?.priorOpeningVolumes;
  if(!contextReady||context.method!==EXTRA_METHODS.scalpstorm_xtreme||!Array.isArray(volumes)||volumes.length!==20||
   volumes.some((x,i)=>!/^\d{4}-\d\d-\d\d$/.test(x.day)||x.day>=state.day||i&&x.day<=volumes[i-1].day||!Number.isSafeInteger(x.volume)||x.volume<=0)||
   !Number.isFinite(context.sectorBps)||!sha(context.sectorSourceSha256)||typeof context.sectorKey!=='string')reason='RVOL20_OR_SECTOR_SOURCE_UNQUALIFIED';
  else {
   const rvol=state.openingVolume/(volumes.reduce((s,x)=>s+x.volume,0)/20),relative=(last.close/state.openingPrice-1)*10000-nb;
   const candidate=rvol>=2&&relative>=50&&context.sectorBps>-50&&buy?'BUY':rvol>=2&&relative<=-50&&context.sectorBps<50&&sell?'SELL':null;
   // A breakout and a retest must be in DIFFERENT completed windows.
   if(state.breakSide&&state.retested&&candidate===state.breakSide)side=candidate;
   if(state.breakSide&&!state.retested){
    if(state.breakSide==='BUY'&&window.some(b=>b.low<=state.openingHigh*1.001)&&last.close>=state.openingHigh||
     state.breakSide==='SELL'&&window.some(b=>b.high>=state.openingLow*.999)&&last.close<=state.openingLow)state.retested=true;
   }
   if(!state.breakSide&&candidate){state.breakSide=candidate;state.retested=false}
   reason=side?'RVOL_SECTOR_RETEST_RESUMED':rvol<2?'RVOL_BELOW_TWO':'WAIT_BREAK_RETEST_RESUME';
   evidence={rvol,relativeBps:relative,sectorBps:context.sectorBps,sectorKey:context.sectorKey};
  }
 }
 if(warmup)side=null;
 state.lastTime=last.time;
 return {state,decision:{strategyId,sourceDate:state.day,symbol:state.symbol,status:side?'SIGNAL':'NO_TRADE',side,reason,methodVersion:EXTRA_METHODS[strategyId],barEndedAt:new Date(last.time+60000).toISOString(),sourceSha256:window.map(b=>b.sourceSha256),contextSha256:contextReady?context.sourceSha256:null,evidence,evidenceClass:'FORWARD_COMPLETED_SOURCE_ONLY',paperOnly:true,realOrdersEnabled:false}};
}
