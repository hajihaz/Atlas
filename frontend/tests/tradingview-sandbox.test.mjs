import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const component=readFileSync(new URL('../src/components/StockWatchPage.tsx',import.meta.url),'utf8');
const policy=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'))
 .headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;
test('third-party chart executes inside its own sandboxed iframe, never app DOM',()=>{
 assert.match(component,/srcDoc=\{documentHTML\}/);
 assert.match(component,/sandbox="allow-scripts allow-popups"/);
 assert.doesNotMatch(component,/sandbox="[^"]*allow-same-origin/);
 assert.doesNotMatch(component,/document\.createElement\('script'\)/);
 assert.doesNotMatch(component,/target\.replaceChildren/);
 assert.match(component,/external-embedding\/embed-widget-advanced-chart\.js/);
});
test('TradingView nested widget frame is strictly CSP allowlisted',()=>{
 assert.match(policy,/frame-src 'self' https:\/\/s\.tradingview\.com https:\/\/www\.tradingview\.com https:\/\/www\.tradingview-widget\.com;/);
 assert.match(policy,/object-src 'none'/);
 assert.match(policy,/form-action 'none'/);
});
test('stock selectors remain bounded to source-attributed BSE EOD symbols',()=>{
 for(const name of ['BSE:RELIANCE','BSE:TCS','BSE:INFY','BSE:HDFCBANK','BSE:SBIN','BSE:ICICIBANK','BSE:SENSEX'])
  assert.ok(component.includes(name));
 assert.match(component,/not an Atlas broker\/trading-data API/);
 assert.doesNotMatch(component,/fetch\(.*tradingview/i);
});
