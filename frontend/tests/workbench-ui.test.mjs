import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const app=read('../src/App.tsx');
const paper=read('../src/components/PaperTestingPage.tsx');
const market=read('../src/components/MarketEvidencePage.tsx');
const schedule=read('../src/components/CloudPaperPage.tsx');
const rules=read('../src/data/atlasSeven.ts');
const gateway=read('../api/cloud-paper.js');
test('the seven owner-defined rules are the only active strategy catalog in the UI',()=>{
 for(const name of ['ScalpStorm X','ScalpStorm X2','ScalpStorm X3','ScalpStorm Xtreme',
  'VWAP Precision','RSI-2 Snapback','Dual Momentum Rotation'])assert.ok(rules.includes(name),name);
 for(const old of ['SMA 9/21 Crossover','EMA 12/26 Momentum','RSI 14 Mean Reversion',
  '20-Bar Breakout','SPS Swing Pullback'])assert.ok(!rules.includes(old),old);
 assert.match(paper,/ATLAS_RULES\.map/);
 assert.match(paper,/setSelected\(x\.id\)/);
});
test('paper status and market watch use owner-only cloud reads',()=>{
 assert.match(paper,/cloudPaperRequest<Catalog>\(auth,'seven-strategies'\)/);
 assert.match(paper,/cloudPaperRequest<State>\(auth,'state'\)/);
 assert.match(market,/cloudPaperRequest<Daybook>\('','daybook',\{day\}\)/);
 assert.match(gateway,/'seven-strategies': \['GET'\]/);
 assert.match(gateway,/daybook: \['GET'\]/);
 assert.match(gateway,/Authorization:bearer/);
});
test('scheduled paper orders remain a distinct working page',()=>{
 assert.match(app,/page==='schedule'\?<CloudPaperPage/);
 assert.match(schedule,/idempotency_key:crypto\.randomUUID/);
 assert.match(schedule,/Schedule a paper order/);
 assert.match(schedule,/fresh, source-timestamped NSE quotes/);
 assert.doesNotMatch(schedule,/place_order\(|broker\.submit/);
});
test('market watch does not show incomplete ranks as verified',()=>{
 assert.match(market,/complete_0940_snapshot/);
 assert.match(market,/A complete ranked universe is not verified/);
 assert.match(market,/realOrdersEnabled!==false/);
});
