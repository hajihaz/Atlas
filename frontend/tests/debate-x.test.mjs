import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
const app=read('../src/App.tsx');
const page=read('../src/components/DebateXPage.tsx');
const report=JSON.parse(read('../public/debate-x-report.json'));

test('Debate X has a first-class navigation page without replacing the existing council',()=>{
  assert.match(app,/id:'debate',title:'Debate X'/);
  assert.match(app,/page==='debate'\?<DebateXPage\/>/);
  assert.match(app,/AgentCouncilPanel|StrategyLabPage/);
  assert.match(app,/#debate-x/);
});

test('bundled report explicitly contains zero measured NSE returns or orders',()=>{
  assert.equal(report.schema,2);
  assert.equal(report.mode,'THREE_WAY_PAPER_CHALLENGE');
  assert.equal(report.sessions_completed,0);
  assert.equal(report.challenge_sessions,15);
  assert.equal(report.rules_equity_inr,'100000');
  assert.equal(report.ai_coverage_complete,false);
  assert.equal(report.live_orders_enabled,false);
  assert.equal(report.real_orders_placed,0);
  assert.equal(report.certified_forward,false);
  assert.equal(report.trade_count,0);
  assert.equal(report.comparison_valid,false);
  assert.deepEqual(report.rows,[]);
  assert.deepEqual(report.evaluations,[]);
});

test('Debate X UI rejects live flags, displays false-data empty states and local-only import',()=>{
  assert.match(page,/r\.live_orders_enabled!==false/);
  assert.match(page,/r\.real_orders_placed!==0/);
  assert.match(page,/No validated AI equity history yet/);
  assert.match(page,/No settled debates for this filter/);
  assert.match(page,/Local file \(not independently certified or uploaded\)/);
  assert.match(page,/Bull/);
  assert.match(page,/Bear/);
  assert.match(page,/Judge/);
  assert.doesNotMatch(page,/fetch\(['"]\/api\/.*?order/);
});

test('three-way challenge renders separate original, rules and AI lines without invented AI returns',()=>{
  assert.match(page,/Rules comparator/);
  assert.match(page,/Three virtual portfolios/);
  assert.match(page,/AI unavailable \/ partial/);
  assert.match(page,/No certified results/);
  assert.match(page,/challenge_sessions/);
  assert.match(page,/t\.real_orders_placed!==0/);
  assert.equal(report.comparison_valid,false);
});
