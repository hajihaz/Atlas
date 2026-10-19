import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMarketFrame,startPublicStream,STREAM_ASSETS} from '../src/lib/publicStream.js';
const now=Date.parse('2026-10-19T11:30:00Z');
const frame=(prices,ts=now)=>'42'+JSON.stringify([
 'currentPrices@spot#update',{data:{prices,ts,pr:'SPOT'}}]);
test('only actual timestamp-valid INR provider updates are accepted',()=>{
 const actual=parseMarketFrame(frame({BTCINR:8234567,ETHINR:243000,SOLINR:12345}),now);
 assert.deepEqual(actual.map(x=>x.symbol),['BTCINR','ETHINR','SOLINR']);
 assert.equal(actual[0].currency,'INR');
 assert.equal(actual[0].price,8234567);
 assert.equal(actual[0].bid,null);
 assert.equal(actual[0].sourceAt,new Date(now).toISOString());
});
test('reject other Socket.IO events, stale/future timestamps, poison fields',()=>{
 assert.deepEqual(parseMarketFrame('0'+JSON.stringify({sid:'x'}),now),[]);
 assert.deepEqual(parseMarketFrame('42'+JSON.stringify(['order-update',{data:{}}]),now),[]);
 assert.deepEqual(parseMarketFrame(frame({BTCINR:100},now-100000),now),[]);
 assert.deepEqual(parseMarketFrame(frame({BTCINR:100},now+6000),now),[]);
 assert.deepEqual(parseMarketFrame(frame({BTCINR:Infinity}),now),[]);
 assert.deepEqual(parseMarketFrame(frame({BTCINR:-5}),now),[]);
 assert.deepEqual(parseMarketFrame(frame({BTCINR:0}),now),[]);
 assert.deepEqual(parseMarketFrame(frame({BTCINR:'x'}),now),[]);
 assert.deepEqual(parseMarketFrame(frame({BTCINR:null}),now),[]);
 assert.ok(!STREAM_ASSETS.includes('NSE:RELIANCE'));
});
test('socket handshake joins only public 1-second spot channel and closes cleanly',()=>{
 const updates=[],statuses=[],timers=[];
 class MockSocket{
  static last;
  constructor(url){this.url=url;this.readyState=1;this.sent=[];MockSocket.last=this;}
  send(v){this.sent.push(v)}
  close(){this.readyState=3;this.onclose?.();}
  trigger(msg){this.onmessage?.({data:msg})}
 }
 const stop=startPublicStream({onQuote:q=>updates.push(q),onStatus:s=>statuses.push(s),
  WebSocketType:MockSocket,now:()=>now,
  after:cb=>{const t={cb};timers.push(t);return t;},
  cancel:()=>{}});
 const ws=MockSocket.last;
 assert.match(ws.url,/wss:\/\/stream-spot\.coindcx\.com\/socket.io\/\?transport=websocket&EIO=4/);
 ws.trigger('0'+JSON.stringify({sid:'x'}));
 assert.equal(ws.sent[0],'40');
 ws.trigger('40');
 assert.equal(ws.sent[1],'42'+JSON.stringify(['join',{channelName:'currentPrices@spot@1s'}]));
 ws.trigger(frame({BTCINR:8175000}));
 assert.equal(updates.length,1);
 assert.equal(updates[0].price,8175000);
 assert.ok(statuses.includes('STREAMING'));
 stop();
 assert.equal(ws.readyState,3);
});
