/**
 * Validates an already-authenticated Upstox V3 full-quotes snapshot.
 * Pure transformation: NEVER performs network requests, auth or broker orders.
 * Exchange price timestamp remains a provenance check; observed_at is the
 * authenticated collector's single-response receipt time, not trade time.
 * This supports exactly one <=500-stock eligible universe per REST snapshot.
 */
const SYMBOL=/^[A-Z][A-Z0-9&-]{0,29}$/;
const MAX_SOURCE_AGE=60000;
const MAX_TOP10_TRADE_AGE=15000;
const ISO=/^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/;
const fail=reason=>{throw Error(`UPSTOX_FEED_BLOCKED: ${reason}`);};
const millis=x=>{
  if(typeof x==='number'&&Number.isSafeInteger(x))return x;
  if(typeof x==='string'&&/^\d{13}$/.test(x))return Number(x);
  if(typeof x==='string'&&ISO.test(x)){const n=Date.parse(x);if(Number.isFinite(n))return n;}
  return NaN;
};
function validTime(time,now,maxAge){
  const t=millis(time);
  if(!Number.isFinite(t)||t>now+2000||now-t>maxAge)fail('missing, stale or future source timestamp');
  return t;
}
function pricePaise(value){
  if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>10**8)fail('invalid market price');
  const rounded=Math.round(value*100);
  if(!Number.isSafeInteger(rounded)||rounded<=0)fail('invalid paise price');
  return rounded;
}
/**
 * @param {object} input
 *  input.payload: complete single V3 /market-quote/quotes response
 *  input.universe: approved equity universe [{symbol,instrument_token}] with 500 stocks
 *  input.receivedAt: actual authenticated HTTP collector response-received epoch ms
 *  input.sourceId: configured entitled source name; exact worker FEED_SOURCE_ID
 *  input.index: separately authenticated Nifty 50 V3 quote response
 *  input.authorized: must be true after validating API entitlement/terms
 */
export function normalizeUpstoxV3(input){
  const {payload,universe,receivedAt,index,sourceId,authorized}=input??{};
  if(authorized!==true)fail('provider account and license not verified');
  if(!Number.isSafeInteger(receivedAt)||receivedAt<=0)fail('invalid collector receipt clock');
  if(typeof sourceId!=='string'||sourceId.length<3||sourceId.length>100)fail('configured source required');
  if(!Array.isArray(universe)||universe.length!==500)fail('strict 500-instrument eligible universe required');
  if(payload?.status!=='success'||!payload?.data||typeof payload.data!=='object')fail('Upstox market response incomplete');
  const symbols=new Set(),tokens=new Set(),quotes=[];
  for(const item of universe){
    if(!item||typeof item.symbol!=='string'||!SYMBOL.test(item.symbol)||
      typeof item.instrument_token!=='string'||!item.instrument_token.startsWith('NSE_EQ|')||
      symbols.has(item.symbol)||tokens.has(item.instrument_token))fail('invalid or duplicate instrument entitlement');
    symbols.add(item.symbol);tokens.add(item.instrument_token);
    const returned=payload.data[`NSE_EQ:${item.symbol}`];
    if(!returned||returned.symbol!==item.symbol||returned.instrument_token!==item.instrument_token)fail('missing or mismatched NSE instrument');
    validTime(returned.timestamp,receivedAt,MAX_SOURCE_AGE);
    const lastTrade=validTime(returned.last_trade_time,receivedAt,24*3600000);
    const volume=returned.volume;
    if(!Number.isSafeInteger(volume)||volume<0)fail('invalid total daily volume');
    quotes.push({symbol:item.symbol,price_paise:pricePaise(returned.last_price),
      cumulative_volume:volume,source:sourceId,exchange_open:true,
      // One authenticated HTTP full-quotes snapshot; *not* exchange tick time.
      observed_at:new Date(receivedAt).toISOString(),
      _last_trade_ms:lastTrade});
  }
  if(Object.keys(payload.data).length!==universe.length)fail('unrecognized instruments in quote response');
  const winners=[...quotes].sort((a,b)=>b.cumulative_volume-a.cumulative_volume||a.symbol.localeCompare(b.symbol)).slice(0,10);
  if(winners.length!==10||winners.some(q=>receivedAt-q._last_trade_ms>MAX_TOP10_TRADE_AGE))fail('stale trade price among top-volume candidates');
  if(index?.status!=='success'||!index?.data||typeof index.data!=='object')fail('Nifty index source missing');
  const nifty=index.data['NSE_INDEX:Nifty 50'];
  if(!nifty||nifty.instrument_token!=='NSE_INDEX|Nifty 50')fail('Nifty instrument mismatch');
  validTime(nifty.timestamp,receivedAt,MAX_SOURCE_AGE);
  validTime(nifty.last_trade_time,receivedAt,MAX_TOP10_TRADE_AGE);
  const nowPrice=Number(nifty.last_price),prev=Number(nifty.prev_close_price);
  if(!Number.isFinite(nowPrice)||!Number.isFinite(prev)||nowPrice<=0||prev<=0)fail('Nifty benchmark price invalid');
  const nifty_change_bps=Math.round((nowPrice-prev)/prev*10000);
  if(!Number.isSafeInteger(nifty_change_bps)||Math.abs(nifty_change_bps)>10000)fail('Nifty change out of range');
  return {
    quotes:quotes.map(({_last_trade_ms,...q})=>q),
    coverage:{complete:true,eligible_count:universe.length,nifty_change_bps},
  };
}
