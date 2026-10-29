import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {getLab} from '../api/strategy-lab.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('Atlas has exactly one published strategy, ScalpStorm X',async()=>{
 const catalog=await getLab();
 assert.deepEqual(catalog.strategies.map(s=>s.id),['scalpstorm_x_0940']);
 assert.equal(catalog.strategies[0].name,'ScalpStorm X');
 assert.equal(catalog.realOrdersEnabled,false);
 assert.equal(catalog.strategies[0].results,null);
});
test('active application hides every retired strategy and does not schedule previous browser trials',()=>{
 const app=read('../src/App.tsx');
 const strategy=read('../src/components/StrategyLabPage.tsx');
 const overview=read('../src/components/RealMarketPage.tsx');
 assert.match(strategy,/ScalpStormDetailed/);
 assert.doesNotMatch(strategy,/AgentCouncilPanel|sma_9_21|rsi_14|EMA/);
 assert.doesNotMatch(app,/<PaperTrialsPage/);
 assert.doesNotMatch(overview,/5 named models|Explore 5 strategies|Five source-driven virtual accounts/);
 const runner=read('../src/lib/usePaperTrials.ts');
 assert.doesNotMatch(runner,/advancePaperGroup|setInterval|localStorage/);
});
test('release output excludes retired strategy account JSON',()=>{
 for(const name of ['cloud-paper.json','cloud-paper-daybook.json','daytrader-nse-demo.json'])
  assert.equal(existsSync(new URL('../dist/'+name,import.meta.url)),false,name);
});
