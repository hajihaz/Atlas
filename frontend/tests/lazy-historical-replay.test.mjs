import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const page=readFileSync(new URL('../src/components/StrategyLabPage.tsx',import.meta.url),'utf8');
const chart=readFileSync(new URL('../src/components/LightweightEquityReplay.tsx',import.meta.url),'utf8');

test('TradingView replay is split from Atlas main dashboard until research details need it',()=>{
 assert.match(page,/lazy\(\(\)=>import\('\.\/LightweightEquityReplay'\)\)/);
 assert.doesNotMatch(page,/import LightweightEquityReplay from/);
 assert.match(page,/<Suspense fallback=/);
 assert.match(page,/<LightweightEquityReplay points=/);
});

test('replay remains read-only, has timeline control and source disclosure',()=>{
 assert.match(chart,/createChart\(/);
 assert.match(chart,/type="range"/);
 assert.match(chart,/Historical replay/);
 assert.match(chart,/not authenticated orders/);
 assert.match(chart,/Charts by TradingView/);
 assert.doesNotMatch(chart,/fetch\(|placeorder|submitOrder|createOrder/);
});
