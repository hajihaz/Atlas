import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const app=read('../src/App.tsx'),owner=read('../src/components/OwnerStrategyPage.tsx');
test('active strategy routes share the owner account and old comparison workers are absent',()=>{
 assert.match(app,/<OwnerStrategyPage\/>/);assert.match(app,/<OwnerEvidencePage\/>/);
 assert.match(app,/<StockWatchPage theme=\{theme\}/);
 assert.doesNotMatch(app,/usePaperTrials|PaperTrialsPage|RealMarketPage|RiskAuditPage/);
 assert.match(read('../src/components/StrategyLabPage.tsx'),/<OwnerStrategyPage\/>/);
 assert.match(read('../src/components/NsePaperPage.tsx'),/OwnerStrategyPage/);
});
test('single strategy shows source-observed account and causal selection',()=>{
 for(const label of ['9:40','3:15','₹1,00,000','₹10,000','Net paper P/L','Volume timestamp'])assert.ok(owner.includes(label));
 assert.match(owner,/report\?\.equityINR/);assert.match(owner,/report\?\.netPnlINR/);
 assert.match(owner,/subsequent fresh trade/);assert.match(owner,/remaining cash/);
 assert.match(owner,/bid\/ask liquidity/);assert.match(owner,/unfilled exits stay visible/);
 assert.doesNotMatch(owner,/Math\.random|runAllStrategies|SYNTHETIC_FIXTURE/);
});
test('unrun history has no manufactured return and account reads never mutate',()=>{
 assert.match(owner,/completedSessions:null,netPnlINR:null/);
 assert.match(owner,/ledgerVerified===true/);assert.match(owner,/mode==='FORWARD'/);
 assert.doesNotMatch(owner,/method:\s*['\"](?:POST|PUT|DELETE)/);
 assert.match(owner,/last verified account is preserved/);
});
test('market panel keeps read-only vendor attribution and responsive styling',()=>{
 const stock=read('../src/components/StockWatchPage.tsx');
 assert.match(stock,/embed-widget-advanced-chart\.js/);assert.match(stock,/TradingView/);
 assert.match(read('../src/owner-strategy.css'),/@media/);
 assert.match(app,/aria-pressed=\{theme === 'dark'\}/);
});
