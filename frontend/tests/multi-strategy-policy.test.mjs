// Guards ADR-0070: Atlas is a multi-strategy paper platform. ScalpStorm X is the flagship,
// not the only strategy, and Debate X supports (never replaces) strategies.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import test from 'node:test';
import {STRATEGIES} from '../lib/research-engine.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const FIVE=['sma_9_21','ema_12_26','rsi_14','breakout_20','sps_pullback'];

test('the five approved intraday strategies remain registered',()=>{
  assert.deepEqual(STRATEGIES.map(s=>s.id),FIVE);
  for(const s of STRATEGIES)assert.ok(s.name&&s.logic&&s.description,s.id+' keeps its definition');
});

test('the Strategy Lab API lists the flagship plus all registered strategies and still replays them',()=>{
  const lab=read('../api/strategy-lab.js');
  assert.match(lab,/runAllStrategies/);
  assert.match(lab,/\.\.\.STRATEGIES\.map/);
  assert.match(lab,/scalpstorm_x_0940/);
  assert.match(lab,/flagship:true/);
});

test('the UI still exposes strategies, research, paper trials, ScalpStorm X and Debate X',()=>{
  const app=read('../src/App.tsx');
  for(const id of ['strategies','research','scalpstorm','debate','orders'])
    assert.match(app,new RegExp("\\{id:'"+id+"'"),'nav item '+id);
  assert.match(app,/PaperTrialsPage = lazy\(\(\) => import\('\.\/components\/PaperTrialsPage'\)\)/);
  assert.match(app,/<PaperTrialsPage/);
  assert.ok(existsSync(new URL('../src/components/PaperTrialsPage.tsx',import.meta.url)));
});

test('five-strategy forward paper checkpoint runner is preserved and PAPER_ONLY',()=>{
  // The cron trigger is an owner operations decision (unattended commits to main); the
  // runner, manual dispatch and the live-trading guards must always remain.
  const wf=read('../../.github/workflows/atlas-paper-scheduled.yml');
  assert.match(wf,/workflow_dispatch:/);
  assert.match(wf,/ATLAS_EXECUTION_MODE: PAPER_ONLY/);
  assert.match(wf,/real-orders\.json/);
  assert.ok(existsSync(new URL('../../scripts/run_scheduled_paper.mjs',import.meta.url)));
  assert.ok(existsSync(new URL('../../scripts/scheduled_paper_engine.mjs',import.meta.url)));
});

test('Debate X reviews all six approved strategies and the risk gate stays authoritative',()=>{
  const reg=read('../../src/atlas/debate_x/strategies.py');
  for(const id of ['scalpstorm_x_0940',...FIVE])assert.ok(reg.includes('"'+id+'"'),id);
  const engine=read('../../src/atlas/debate_x/engine.py');
  assert.match(engine,/RiskGate/);
  assert.match(engine,/if not risk\.approved:/);
});

test('the decision record exists',()=>{
  const adr=read('../../docs/adr/0070-multi-strategy-platform-flagship-and-debate-x.md');
  assert.match(adr,/ScalpStorm X is the \*\*flagship\*\*/);
  assert.match(adr,/PAPER_ONLY/);
});
