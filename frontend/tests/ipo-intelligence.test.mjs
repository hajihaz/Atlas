import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/components/IPOIntelligencePage.tsx',import.meta.url),'utf8');
const logic=readFileSync(new URL('../src/lib/ipoIntelligence.ts',import.meta.url),'utf8');
const snapshot=JSON.parse(readFileSync(new URL('../public/ipo-feed.json',import.meta.url),'utf8'));
test('IPO has a navigable read-only page',()=>{
  assert.match(app,/type Page='home'\|'paper'\|'markets'\|'data'\|'replay'\|'schedule'\|'crypto'\|'ipo'/);
  assert.match(app,/IPOIntelligencePage/);
  assert.match(app,/onClick=\{\(\)=>go\('ipo'\)\}/);
  assert.doesNotMatch(page,/fetch\(['"]\/api\/(?:trade|order|bid|broker)/);
  assert.match(page,/No IPO bid is placed here/);
});
test('partial-source observations are explicitly marked stale',()=>{
  assert.match(logic,/export function issueSourceStale/);
  assert.match(logic,/if\(issue\.sourceStale\)return true/);
  assert.match(page,/issueSourceStale\(issue\)/);
  assert.match(page,/issueSourceStale\(i\)/);
  assert.match(page,/Its source is stale or unavailable/);
});
test('GMP and financial data retain nonzero uncertainty',()=>{
  assert.match(logic,/financials===null/);
  assert.match(logic,/HOLD — DO NOT APPLY YET/);
  assert.match(page,/GMP is unregulated/);
  assert.match(page,/ListingAccuracy/);
});
test('published IPO snapshot never invents issue identities or futures returns',()=>{
  assert.equal(snapshot.schemaVersion,1);
  assert.ok(snapshot.generatedAt);
  assert.ok(Array.isArray(snapshot.issues));
  assert.ok(snapshot.issues.every(i=>['SME','MAINBOARD'].includes(i.board)&&i.source.startsWith('https://')&&i.openDate<=i.closeDate));
  assert.ok(snapshot.issues.every(i=>i.gmp===null||Number.isFinite(i.gmp)));
  assert.ok(snapshot.issues.every(i=>typeof i.sourceObservedAt==='string'&&typeof i.sourceStale==='boolean'));
});
