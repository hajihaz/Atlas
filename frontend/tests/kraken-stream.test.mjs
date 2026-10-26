import test from 'node:test';
import assert from 'node:assert/strict';
import {parseKrakenTrades,startKrakenStream,KRAKEN_ASSETS} from '../src/lib/krakenStream.js';
const now=Date.parse('2026-10-25T04:20:00Z');
const trade=(fields={})=>({symbol:'BTC/USD',price:80000,timestamp:new Date(now).toISOString(),trade_id:17,...fields});
const frame=(rows=[trade()],type='update')=>JSON.stringify({channel:'trade',type,data:rows});
test('native USD timestamps, prices and IDs remain attributable; snapshots are not live ticks',()=>{
 const q=parseKrakenTrades(frame(),now);
 assert.equal(q.length,1);assert.equal(q[0].currency,'USD');assert.equal(q[0].tradeId,17);
 assert.equal(q[0].sourceAt,new Date(now).toISOString());assert.equal(q[0].price,80000);
 assert.deepEqual(parseKrakenTrades(frame([trade()],'snapshot'),now),[]);
 for(const fields of [{symbol:'BTCINR'},{price:true},{price:'80000'},{price:0},{price:-1},
  {timestamp:new Date(now+6000).toISOString()},{timestamp:new Date(now-91000).toISOString()},
  {timestamp:'2026-10-25'},{trade_id:1.5},{trade_id:-1}]){
  assert.deepEqual(parseKrakenTrades(frame([trade(fields)]),now),[]);
 }
 for(const bad of ['null','{"channel":"heartbeat"}','bad', ' '.repeat(220001)])
  assert.deepEqual(parseKrakenTrades(bad,now),[]);
});
function harness(){
 const sockets=[],timers=[],quotes=[],statuses=[];
 class Socket{
  constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}
  open(){this.readyState=1;this.onopen?.();}
  send(data){this.sent.push(JSON.parse(data));}
  close(){this.readyState=3;this.onclose?.();}
  emit(data){this.onmessage?.({data});}
 }
 const stop=startKrakenStream({onQuote:q=>quotes.push(q),onStatus:s=>statuses.push(s),WebSocketType:Socket,
  now:()=>now,after:(cb,ms)=>{const t={cb,ms,cancelled:false};timers.push(t);return t;},
  cancel:t=>{t.cancelled=true;}});
 const ack=socket=>socket.emit(JSON.stringify({method:'subscribe',success:true,result:{channel:'trade',symbol:'BTC/USD'}}));
 return {sockets,timers,quotes,statuses,stop,ack};
}
test('public allowlist, no snapshots, heartbeat health, exact-once monotonically ordered trades',()=>{
 const h=harness(),s=h.sockets[0];s.open();
 assert.equal(s.url,'wss://ws.kraken.com/v2');
 assert.deepEqual(s.sent,[{method:'subscribe',params:{channel:'trade',symbol:[...KRAKEN_ASSETS],snapshot:false}}]);
 s.emit(frame());assert.equal(h.quotes.length,0);
 h.ack(s);s.emit('{"channel":"heartbeat"}');assert.equal(h.quotes.length,0);
 s.emit(frame());s.emit(frame());s.emit(frame([trade({trade_id:16})]));
 s.emit(frame([trade({trade_id:18,timestamp:new Date(now-1000).toISOString()})]));
 assert.equal(h.quotes.length,1);
 assert.equal(h.statuses.at(-1),'STREAMING');
 h.stop();h.stop();assert.equal(s.readyState,3);
 assert.ok(h.timers.every(t=>t.cancelled));
});
test('disconnect reconnects, rejects old-socket callbacks, cleanup prevents any retry',()=>{
 const h=harness(),first=h.sockets[0];first.open();h.ack(first);first.emit(frame());first.close();
 const retry=h.timers.find(t=>t.ms===1000&&!t.cancelled);assert.ok(retry);retry.cb();
 const second=h.sockets[1];second.open();h.ack(second);
 first.emit(frame([trade({trade_id:99})]));assert.equal(h.quotes.length,1);
 second.emit(frame([trade({trade_id:18})]));assert.equal(h.quotes.length,2);
 h.stop();const count=h.sockets.length;
 for(const timer of h.timers)timer.cb();
 assert.equal(h.sockets.length,count);
});
test('unacknowledged and silent subscriptions close; provider rejection is never STREAMING',()=>{
 const h=harness();h.sockets[0].open();
 h.timers.find(t=>t.ms===12000).cb();assert.equal(h.sockets[0].readyState,3);
 h.stop();
 const g=harness();g.sockets[0].open();g.ack(g.sockets[0]);
 g.timers.find(t=>t.ms===30000&&!t.cancelled).cb();assert.equal(g.sockets[0].readyState,3);g.stop();
 const k=harness();k.sockets[0].open();
 k.sockets[0].emit('{"method":"subscribe","success":false,"error":"not available"}');
 assert.ok(!k.statuses.includes('STREAMING'));assert.equal(k.sockets[0].readyState,3);k.stop();
});
test('constructor failure has bounded retry and can be stopped',()=>{
 const timers=[],statuses=[];
 class Broken{constructor(){throw Error('offline');}}
 const stop=startKrakenStream({onQuote:()=>assert.fail(),onStatus:s=>statuses.push(s),WebSocketType:Broken,
  after:(cb,ms)=>{const t={cb,ms};timers.push(t);return t;},cancel:()=>{}});
 assert.equal(statuses.at(-1),'DISCONNECTED');assert.equal(timers[0].ms,1000);stop();timers[0].cb();
 assert.equal(timers.length,1);
});
