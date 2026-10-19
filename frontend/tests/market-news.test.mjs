import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import handler,{buildNewsUrl,getMarketNews,normalizeGdelt} from '../api/market-news.js';
const now=Date.parse('2026-10-20T04:30:00Z');
const valid={title:'Bitcoin cryptocurrency market update',
 url:'https://example.com/bitcoin-market?foo=1',
 seendate:'20261020T040000Z'};
const source={headers:{get:k=>k==='content-type'?'application/json':null},
 ok:true,json:async()=>({articles:[valid]})};

test('allowlisted crypto-only queries cannot be used as arbitrary proxy',()=>{
 for(const s of ['BTCINR','ETHINR','SOLINR','XRPINR','DOGEINR']){
   const u=new URL(buildNewsUrl(s));
   assert.equal(u.protocol,'https:');assert.equal(u.hostname,'api.gdeltproject.org');
   assert.equal(u.searchParams.get('maxrecords'),'8');
   assert.equal(u.searchParams.get('format'),'json');
 }
 for(const bad of ['NSE:RELIANCE','../../../etc/passwd','DOGEINR&mode=evil','']){
   assert.throws(()=>buildNewsUrl(bad),RangeError);
 }
});

test('bounded recent links never leak malicious or historical results',()=>{
 const input=[valid,valid,
   {...valid,url:'javascript:alert(1)'},
   {...valid,url:'file:///secret'},
   {...valid,url:'https://user:pass@evil.example/'},
   {...valid,seendate:'20000101T000000Z'},
   {...valid,seendate:'20500101T000000Z'},
   {...valid,seendate:'not-a-date'},
   {...valid,url:'https://news.example.org/headline',title:'Another market article'}];
 const cleaned=normalizeGdelt(input,now);
 assert.equal(cleaned.length,2);
 assert.ok(cleaned.every(v=>v.publishedAt.startsWith('2026-10-20T04:00')));
 assert.ok(cleaned.every(v=>v.url.startsWith('https://')));
 assert.equal(cleaned[0].domain,'example.com');
});
test('headline endpoint outputs attributed links, never fake sentiment or orders',async()=>{
 const out=await getMarketNews('BTCINR',async()=>source,now);
 assert.equal(out.schema,1);
 assert.equal(out.mode,'SOURCE_LINKS_ONLY');
 assert.equal(out.status,'OBSERVED');
 assert.equal(out.articles.length,1);
 assert.equal(out.liveOrdersEnabled,false);
 assert.equal(out.paperOrdersExecuted,false);
 assert.ok(!('sentimentScore' in out));
 assert.match(out.warning,/No sentiment score/);
});
test('no provider matches returns a truthful empty list',async()=>{
 const out=await getMarketNews('ETHINR',
   async()=>({...source,json:async()=>({articles:[]})}),now);
 assert.equal(out.status,'NO_MATCHES');assert.deepEqual(out.articles,[]);
});
test('bad provider contract, HTML, 429 all fail closed',async()=>{
 await assert.rejects(getMarketNews('BTCINR',async()=>({ok:false}),now));
 await assert.rejects(getMarketNews('BTCINR',async()=>({
   ...source,headers:{get:()=> 'text/html'}}),now));
 await assert.rejects(getMarketNews('BTCINR',async()=>({
   ...source,json:async()=>({unexpected:'value'})}),now));
});
test('GET-only endpoint rejects arbitrary symbols and writes no orders',async()=>{
 const res={setHeader(k,v){this[k]=v},status(n){this.code=n;return this},json(x){return x}};
 const p=await handler({method:'POST',query:{symbol:'BTCINR'}},res);
 assert.equal(res.code,405);assert.equal(p.error,'method_not_allowed');
 const q=await handler({method:'GET',query:{symbol:'NSE:FAKE'}},res);
 assert.equal(res.code,400);assert.equal(q.error,'unsupported_market');
});
test('client displays headline citations, but council decision remains independent',()=>{
 const text=readFileSync(new URL('../src/components/AgentCouncilPanel.tsx',import.meta.url),'utf8');
 assert.match(text,/SOURCE LINKS/);
 assert.match(text,/api\/market-news/);
 assert.match(text,/noopener noreferrer nofollow/);
 assert.match(text,/report.outcome/);
 assert.doesNotMatch(text,/tradeExecution|placeOrder\(/);
});
