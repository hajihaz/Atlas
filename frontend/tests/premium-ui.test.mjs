import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const app=read('../src/App.tsx');
const paper=read('../src/components/PaperTestingPage.tsx');
const market=read('../src/components/MarketEvidencePage.tsx');
const css=read('../src/styles.css');
const main=read('../src/main.tsx');
test('paper-first navigation has three primary pages and no generic strategy screen',()=>{
 for(const id of ['paper','markets','schedule'])assert.match(app,new RegExp("id:'"+id+"'"));
 for(const old of ["id:'strategies'","id:'research'","id:'scalpstorm'"])
  assert.doesNotMatch(app,new RegExp(old));
 assert.match(app,/PaperTestingPage/);
 assert.match(app,/MarketEvidencePage/);
 assert.match(app,/CloudPaperPage/);
});
test('all shown controls have actions and private owner token remains in memory',()=>{
 assert.match(app,/onClick=\{\(\)=>go\(id\)\}/);
 assert.match(app,/onClick=\{\(\)=>setTheme/);
 assert.match(paper,/onClick=\{\(\)=>void refresh\(\)\}/);
 assert.match(paper,/onClick=\{\(\)=>\{setSelected\(x\.id\);document\.getElementById\('atlas-strategy-detail'\)\?\.scrollIntoView/);
 assert.match(market,/onClick=\{\(\)=>void refresh\(\)\}/);
 assert.doesNotMatch(app,/localStorage\.setItem\([^,]*token|sessionStorage\.setItem\([^,]*token/i);
});
test('UI reports missing evidence rather than invented strategy performance',()=>{
 assert.match(paper,/X_PAPER_PILOT_ARMED_OTHER_SIX_UNARMED/);
 assert.match(paper,/Other six rules await qualified feeds/);
 assert.match(paper,/Not verified/);
 assert.match(paper,/No result is assumed/);
 assert.match(market,/complete_0940_snapshot/);
 assert.match(market,/full eligible universe/);
 assert.doesNotMatch(app,/place_order\(|enableLiveMode/);
});
test('simple workspace is responsive and keeps the existing accessible theme',()=>{
 assert.match(main,/styles\.css/);
 assert.match(css,/\.atlas-strategy-layout/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(app,/aria-label=\{theme==='light'/);
 assert.match(app,/window\.localStorage\.setItem\('atlas\.theme\.preference',theme\)/);
});
