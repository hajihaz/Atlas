// CoinDCX public 1-second Socket.IO Engine.IO WebSocket transport.
// IMPORTANT: no trading/auth channels; no synthetic ticks. Restrict all network origins.
// The wire adapter is deliberately small and fail-closed; if the provider rejects the
// Engine.IO negotiation, the UI falls back to the existing read-only REST feed.
const ENDPOINT='wss://stream-spot.coindcx.com/socket.io/?transport=websocket&EIO=';
const CHANNEL='currentPrices@spot@1s';
export const STREAM_ASSETS=Object.freeze(['BTCINR','ETHINR','SOLINR','XRPINR','DOGEINR']);

export function parseMarketFrame(frame, now=Date.now()){
  if(typeof frame!=='string'||frame.length>220000||!frame.startsWith('42'))return [];
  let event;
  try{event=JSON.parse(frame.slice(2));}catch{return [];}
  if(!Array.isArray(event)||event[0]!=='currentPrices@spot#update')return [];
  const raw=event[1]?.data??event[1];
  const payload=typeof raw==='string'?(()=>{try{return JSON.parse(raw);}catch{return null;}})():raw;
  const prices=payload?.prices;
  const ts=payload?.ts;
  if(!prices||typeof prices!=='object'||!Number.isSafeInteger(ts)
     ||ts>now+5000||now-ts>90000)return [];
  const updates=[];
  for(const symbol of STREAM_ASSETS){
    if(!Object.hasOwn(prices,symbol))continue;
    const rawPrice=prices[symbol];
    const price=typeof rawPrice==='number'||typeof rawPrice==='string'?Number(rawPrice):NaN;
    if(!Number.isFinite(price)||price<=0)continue;
    updates.push({symbol,currency:'INR',price,bid:null,ask:null,
      sourceAt:new Date(ts).toISOString(),ageSeconds:Math.floor((now-ts)/1000),
      status:'recent_provider_stream',provider:'CoinDCX public 1s stream'});
  }
  return updates;
}

// Keep subscription restricted to spot public prices only. No private channels.
export function startPublicStream({
  onQuote, onStatus, WebSocketType=WebSocket, now=Date.now,
  after=setTimeout, cancel=clearTimeout,
}){
  let stopped=false,ws=null,retryTimer=null,version=4,attempts=0,received=false;
  let openTimer=null;
  let pingTimer=null;
  function status(value){if(!stopped)onStatus?.(value);}
  function safeSend(message){
    if(ws?.readyState===1){try{ws.send(message);}catch{status('DISCONNECTED');}}
  }
  function armLegacyPing(interval){
    if(pingTimer!==null)cancel(pingTimer);
    if(version!==3||!Number.isSafeInteger(interval)||interval<1000||interval>120000)return;
    pingTimer=after(()=>{pingTimer=null;if(!stopped&&ws?.readyState===1){safeSend('2');armLegacyPing(interval);}},interval);
  }
  function connect(){
    if(stopped)return;
    attempts++;
    status('CONNECTING');
    let opened=false,joined=false;
    try{ws=new WebSocketType(ENDPOINT+version);}
    catch{reconnect();return;}
    const active=ws;
    openTimer=after(()=>{if(!stopped&&ws===active&&!received){try{active.close();}catch{}}},12000);
    active.onopen=()=>{opened=true;};
    active.onmessage=(message)=>{
      if(stopped||ws!==active||typeof message.data!=='string')return;
      const frame=message.data;
      if(frame.startsWith('0')){
        try{armLegacyPing(JSON.parse(frame.slice(1)).pingInterval);}catch{}
        safeSend('40');return;
      }
      if(frame==='2'){safeSend('3');return;}
      if(frame.startsWith('40')&&!joined){
        joined=true;
        safeSend('42'+JSON.stringify(['join',{channelName:CHANNEL}]));
        status('SUBSCRIBED_WAITING');
        return;
      }
      const updates=parseMarketFrame(frame,now());
      if(updates.length){
        received=true;
        attempts=0;
        if(openTimer!==null){cancel(openTimer);openTimer=null;}
        status('STREAMING');
        for(const q of updates)onQuote(q);
      }
    };
    active.onerror=()=>status('DEGRADED');
    active.onclose=()=>{if(ws===active){ws=null;status('DISCONNECTED');
      if(openTimer!==null){cancel(openTimer);openTimer=null;}
      if(pingTimer!==null){cancel(pingTimer);pingTimer=null;}
      // Probe legacy Engine.IO v3 if server rejects v4. Do not claim verified
      // streaming until a correctly parsed, timestamp-valid provider event.
      if(!received&&attempts>=2)version=3;
      reconnect();
    }};
  }
  function reconnect(){
    if(stopped||retryTimer!==null)return;
    retryTimer=after(()=>{retryTimer=null;connect();},Math.min(30000,1000*2**Math.min(attempts,5)));
  }
  connect();
  return ()=>{
    stopped=true;
    if(retryTimer!==null)cancel(retryTimer);
    if(openTimer!==null)cancel(openTimer);
    if(pingTimer!==null)cancel(pingTimer);
    if(ws){try{ws.close();}catch{}}ws=null;
  };
}
