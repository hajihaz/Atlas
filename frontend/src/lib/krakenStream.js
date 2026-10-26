// Documented public Kraken v2 trade channel. No keys, orders, FX or synthetic ticks.
export const KRAKEN_ASSETS=Object.freeze(['BTC/USD','ETH/USD','SOL/USD','XRP/USD','DOGE/USD']);
const ENDPOINT='wss://ws.kraken.com/v2';

export function parseKrakenTrades(frame,now=Date.now()){
 if(typeof frame!=='string'||frame.length>220000)return [];
 let data;try{data=JSON.parse(frame);}catch{return [];}
 if(data?.channel!=='trade'||data.type!=='update'||!Array.isArray(data.data)||data.data.length>1000)return [];
 const quotes=[];
 for(const trade of data.data){
  if(!trade||!KRAKEN_ASSETS.includes(trade.symbol)||typeof trade.price!=='number'
   ||!Number.isFinite(trade.price)||trade.price<=0||typeof trade.timestamp!=='string'
   ||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(trade.timestamp)
   ||!Number.isSafeInteger(trade.trade_id)||trade.trade_id<0)continue;
  const at=Date.parse(trade.timestamp),age=now-at;
  if(!Number.isFinite(at)||age< -5000||age>90000)continue;
  quotes.push({symbol:trade.symbol,currency:'USD',price:trade.price,bid:null,ask:null,
   sourceAt:new Date(at).toISOString(),ageSeconds:Math.max(0,Math.floor(age/1000)),
   tradeId:trade.trade_id,provider:'Kraken public trades',status:'recent_provider_stream'});
 }
 return quotes;
}

export function startKrakenStream({
 onQuote,onStatus,WebSocketType=WebSocket,now=Date.now,after=setTimeout,cancel=clearTimeout,
}){
 let stopped=false,socket=null,retry=null,health=null,opening=null,attempt=0;
 const latest=new Map();
 const status=value=>{if(!stopped)onStatus?.(value);};
 function clearTimers(){
  if(opening!==null)cancel(opening);
  if(health!==null)cancel(health);
  opening=null;health=null;
 }
 function reconnect(){
  if(stopped||retry!==null)return;
  const delay=Math.min(30000,1000*2**Math.min(attempt++,5));
  retry=after(()=>{retry=null;connect();},delay);
 }
 function connect(){
  if(stopped)return;
  status('CONNECTING');
  let active;
  try{active=new WebSocketType(ENDPOINT);socket=active;}
  catch{status('DISCONNECTED');reconnect();return;}
  let subscribed=false;
  const close=()=>{try{active.close();}catch{lost();}};
  function lost(){
   if(stopped||socket!==active)return;
   socket=null;clearTimers();status('DISCONNECTED');reconnect();
  }
  function alive(){
   if(health!==null)cancel(health);
   health=after(()=>{if(!stopped&&socket===active)close();},30000);
  }
  opening=after(()=>{if(!stopped&&socket===active)close();},12000);
  active.onopen=()=>{
   if(stopped||socket!==active)return;
   try{active.send(JSON.stringify({method:'subscribe',params:{channel:'trade',
    symbol:[...KRAKEN_ASSETS],snapshot:false}}));}
   catch{close();}
  };
  active.onmessage=message=>{
   if(stopped||socket!==active||typeof message.data!=='string'||message.data.length>220000)return;
   let frame;try{frame=JSON.parse(message.data);}catch{return;}
   if(frame?.method==='subscribe'){
    if(frame.success!==true||frame.result?.channel!=='trade'||!KRAKEN_ASSETS.includes(frame.result?.symbol)){
     status('DEGRADED');close();return;
    }
    subscribed=true;
    if(opening!==null){cancel(opening);opening=null;}
    alive();status('SUBSCRIBED_WAITING');return;
   }
   // Heartbeats prove transport health, never quote freshness.
   if(subscribed&&frame?.channel==='heartbeat'){alive();return;}
   if(!subscribed)return;
   const quotes=parseKrakenTrades(message.data,now());
   if(!quotes.length)return;
   alive();attempt=0;
   for(const quote of quotes){
    const previous=latest.get(quote.symbol);
    if(previous&&(quote.tradeId<=previous.tradeId||Date.parse(quote.sourceAt)<Date.parse(previous.sourceAt)))continue;
    latest.set(quote.symbol,quote);status('STREAMING');onQuote(quote);
   }
  };
  active.onerror=()=>{if(!stopped&&socket===active){status('DEGRADED');close();}};
  active.onclose=lost;
 }
 connect();
 return ()=>{
  if(stopped)return;
  stopped=true;
  if(retry!==null)cancel(retry);retry=null;
  clearTimers();
  const active=socket;socket=null;
  if(active){try{active.close();}catch{}}
 };
}
