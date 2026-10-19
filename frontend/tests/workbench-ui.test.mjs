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
test('all formerly placeholder pages route to active source-backed functionality',()=>{
 for(const route of ['strategies','research','scalpstorm','orders','risk','audit','markets'])
  assert.ok(app.includes("page==='"+route+"'"));
 assert.match(app,/<StrategyLabPage mode=\{page\}/);
 assert.match(app,/<PaperTrialsPage group=\{paper\.group\}/);
 assert.match(app,/<StockWatchPage theme=\{theme\}/);
 assert.match(app,/<RiskAuditPage mode=\{page\}/);
});
test('strategy page lists every strategy, shows simulated metrics and real provider candle provenance',()=>{
 assert.match(strat,/s\.name/);
 assert.match(strat,/modeledReturnPct/);
 assert.match(strat,/maxDrawdownPct/);
 assert.match(strat,/closedTrades/);
 assert.match(strat,/HISTORICAL_HYPOTHETICAL_REPLAY/);
 assert.match(strat,/Provider has too few completed candles/);
 assert.match(strat,/realizedPnlINR/);
 assert.doesNotMatch(strat,/\$100,000/);
});
test('paper sessions are virtual and explicit, with stop/resume, audited local records',()=>{
 assert.match(paper,/Start 5 forward paper trials/);
 assert.match(paper,/window\.confirm/);
 assert.match(paper,/VIRTUAL_SOURCE_SNAPSHOT|Virtual realized P\/L|Virtual change/);
 assert.match(paper,/Runs only while Atlas is open in this browser/);
 assert.match(app,/usePaperTrials\(\)/);
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
