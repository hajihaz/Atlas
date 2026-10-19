// Atlas live-source paper checkpoint eligibility probe (read only).
// Does not write reports, place orders, or seed a published paper portfolio.
import {getChart} from '../frontend/api/market-history.js';
import {getLiveFeed} from '../frontend/api/live-feed.js';
import {composeTwoHourCandles,sourceEligible,freshState} from './scheduled_paper_engine.mjs';
const now=Date.now();
const [history,feed]=await Promise.all([
  getChart({symbol:'BTCINR',range:'1W'},fetch,now),
  getLiveFeed(fetch,now),
]);
if(history.source!=='CoinDCX public INR spot candles'||
  history.currency!=='INR'||history.symbol!=='BTCINR'||
  history.paperExecutionEnabled!==false||history.realOrdersEnabled!==false||
  feed.paperExecutionEnabled!==false||feed.realOrdersEnabled!==false) {
    throw Error('Unsafe or unknown live market source');
}
const quote=feed.quotes.find(x=>x.symbol==='BTCINR');
let bars=[],parseError=null;
try{bars=composeTwoHourCandles(history.candles,now);}
catch(e){parseError=e?.message??String(e);}
const ok=bars.length>0&&sourceEligible(bars,quote,now,'BTCINR');
const latestClose=bars.at(-1)?.time+7200000;
const snapshot=ok?freshState('BTCINR',latestClose,now,quote):null;
console.log('ATLAS_READ_ONLY_PAPER_SOURCE_PROBE',JSON.stringify({
  source:history.source,now:new Date(now).toISOString(),
  historyCoverage:history.coverage,hourlyClosedCandles:history.candles.length,
  completeTwoHourCandles:bars.length,latestBarClosedAt:latestClose?new Date(latestClose).toISOString():null,
  lastQuoteTime:quote?.sourceAt??null,quoteStatus:quote?.status??'unknown',
  parseError,eligibleAtProbeTime:Boolean(ok),
  researchPortfoliosIfSeeded:snapshot?.sessions.length??0,
  actualCapitalINR:0,ordersPlaced:0,transactionsCommitted:false,
  reason:ok?'Verified read-only first-run conditions (not a scheduled-run certificate).':
    'The current observation did not meet every first-run gate; do not seed or backfill.',
}));
if(!history.candles.length||!quote||quote.status!=='recent_provider_snapshot'||parseError)
  process.exitCode=1;
