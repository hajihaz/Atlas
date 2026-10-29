import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const app=read('../src/App.tsx');
const strat=read('../src/components/StrategyLabPage.tsx');
const paper=read('../src/components/PaperTrialsPage.tsx');
const stock=read('../src/components/StockWatchPage.tsx');
const main=read('../src/main.tsx');
const css=read('../src/strategy.css');
const vercel=JSON.parse(read('../vercel.json'));
test('all active pages retain navigation while the five-strategy portfolio is not mounted',()=>{
 for(const route of ['strategies','research','scalpstorm','risk','audit','markets'])
  assert.ok(app.includes("page==='"+route+"'"));
 assert.match(app,/<StrategyLabPage mode=\{page\}/);
 assert.match(app,/<SimplePage page='orders' go=\{go\}/);
 assert.doesNotMatch(app,/<PaperTrialsPage group=\{paper\.group\}/);
 assert.match(app,/<StockWatchPage theme=\{theme\}/);
 assert.match(app,/<RiskAuditPage mode=\{page\}/);
});
test('strategy workspace displays ScalpStorm X and its ten equal slots only',()=>{
 assert.match(strat,/<ScalpStormDetailed\/>/);
 assert.match(strat,/<ScalpStormAllocationPlan\/>/);
 assert.doesNotMatch(strat,/modeledReturnPct|AgentCouncilPanel|s\.name/);
});
test('legacy browser strategy execution is disabled without deleting its historic records',()=>{
 const hook=read('../src/lib/usePaperTrials.ts');
 assert.doesNotMatch(hook,/advancePaperGroup|localStorage\.removeItem|fetch\('/);
 assert.match(hook,/group:null as PaperGroup\|null/);
 assert.match(app,/usePaperTrials\(\)/);
 assert.doesNotMatch(app,/start=\{paper\.start\}/);
});
test('free Indian equities have a vendor-attributed chart, not a scraped API',()=>{
 assert.match(stock,/embed-widget-advanced-chart\.js/);
 assert.match(stock,/BSE:RELIANCE/);
 assert.match(stock,/TradingView/);
 assert.match(stock,/Some fake regex that will not be used|last trade time|CoinDCX public ticker/);
 assert.match(vercel.headers[0].headers.find(x=>x.key==='Content-Security-Policy').value,
   /https:\/\/s3\.tradingview\.com/);
 assert.ok(!app.includes('place_order('));
});
test('mobile responsive safe styles are loaded after existing themes',()=>{
 assert.match(main,/import '\.\/strategy\.css';/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(stock,/theme:'light'\|'dark'/);
});

test('archived research council cannot appear in the active ScalpStorm workspace',()=>{
 const council=read('../src/components/AgentCouncilPanel.tsx');
 assert.match(council,/Six-role research council/);
 assert.doesNotMatch(strat,/AgentCouncilPanel/);
 assert.match(strat,/ScalpStormDetailed/);
});
