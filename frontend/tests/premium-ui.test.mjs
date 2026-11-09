import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = p => readFileSync(new URL(p, import.meta.url),'utf8');
const app=read('../src/App.tsx');
const market=read('../src/components/RealMarketPage.tsx');
const main=read('../src/main.tsx');
const css=read('../src/real.css');
const theme=read('../src/premium.css');

test('active app has no simulated equity, frozen financial figures or dollar currency',()=>{
  assert.doesNotMatch(app,/snapshot\.json|historicalInitialCapital|Archived replay equity|finalEquity|usd\(|currency:\s*'USD'/);
  assert.doesNotMatch(market,/currency:\s*'USD'|\$102,536|\$100,000|459|\+2\.54%/);
  assert.doesNotMatch(app,/ScalpStormDetailed/);
  assert.match(market,/5 named models/);
  assert.match(market,/Ready to start/);
  assert.match(market,/currency:'INR'/);
});
test('all existing sections remain reachable without demonstrative trades',()=>{
  for(const id of ['live','overview','markets','ipo','strategies','research','scalpstorm','debate','trials','strategyrisk','risk','orders','audit'])
    assert.match(app,new RegExp("\\{id:'"+id+"'"));
  assert.match(app,/OwnerStrategyPage/);
  assert.match(app,/OwnerEvidencePage/);
  assert.match(app,/RealMarketPage/);
  assert.match(app,/usePaperTrials/);
  assert.match(app,/Broker orders remain disabled/);
});
test('source and stale controls prevent fabricated references',()=>{
  assert.match(market,/Date\.parse\(data\.retrievedAt\)>90000/);
  assert.match(market,/item\.price!==null&&!stale/);
  assert.match(market,/setInterval\(\(\)=>setRefresh\(v=>v\+1\),60000\)/);
  assert.match(market,/last trade time not provided/);
  assert.match(market,/BSE stock charts on TradingView/);
});
test('premium styling persists with new responsive rupee-only dashboard',()=>{
  assert.ok(main.indexOf("import './premium.css';")<main.indexOf("import './real.css';"));
  assert.match(css,/\.real-hero/);
  assert.match(css,/\.real-crypto-grid/);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(theme,/prefers-reduced-motion/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(app,/window\.localStorage\.setItem\(THEME_KEY, theme\)/);
  assert.match(app,/aria-pressed=\{theme === 'dark'\}/);
});
test('only read-only indicative values are permitted in financial cards',()=>{
  assert.match(market,/Virtual paper trials/);
  assert.match(market,/Five source-driven virtual accounts/);
  assert.match(market,/real historical INR backtests/);
  assert.match(market,/All money values in Indian rupees/);
  assert.match(app,/Broker orders remain disabled/);
});
