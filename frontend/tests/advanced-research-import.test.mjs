import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectAdvancedResearchEnvelope} from '../src/lib/advancedResearchPreview.js';

const fixture=()=>JSON.parse(readFileSync(new URL(
 '../../docs/research/advanced/fixture-dashboard-envelope.json',import.meta.url),'utf8'));
test('authentic built-in artificial fixture remains artificial and never becomes forward paper',()=>{
 const x=inspectAdvancedResearchEnvelope(fixture());
 assert.equal(x.fixtureOnly,true);
 assert.equal(x.mode,'SYNTHETIC_FIXTURE_REPLAY');
 assert.equal(x.symbol,'FIXTURE_COIN');
 assert.equal(x.strategies.length,5);
 assert.equal(x.sourceVerifiedByBrowser,false);
 assert.equal(x.performanceCertified,false);
 assert.equal(x.forwardPaperImported,false);
 assert.equal(x.realOrdersEnabled,false);
 assert.ok(x.strategies[0].equity.length>0);
 assert.ok(x.strategies[0].trades.every(t=>t.priceINR>0));
});
test('risk-triggered model exits with null decision stamps are accepted only under known risk codes',()=>{
 const data=fixture();
 const risk=data.strategies.find(s=>s.id==='ema_12_26');
 const row=risk.trades.find(t=>t.reason==='MAX_DRAWDOWN');
 assert.ok(row);
 assert.equal(row.signalBarTime,null);
 assert.doesNotThrow(()=>inspectAdvancedResearchEnvelope(data));
 row.reason='PROFIT_GUARANTEED';
 assert.throws(()=>inspectAdvancedResearchEnvelope(data),/trade event/);
});
test('forged fixture-to-market relabeling and missing provenance fail closed',()=>{
 const failures=[
  v=>{v.mode='HISTORICAL_HYPOTHETICAL_REPLAY';},
  v=>{v.fixtureOnly=false;},
  v=>{v.source.researchUseAllowed=false;},
  v=>{v.source.kind='HISTORICAL_MARKET';},
  v=>{v.currency='USD';},
  v=>{v.audience='THIRD_PARTY';},
  v=>{v.envelopeHash='abc';},
  v=>{v.externallyAudited=true;},
 ];
 for(const mutate of failures){
  const x=fixture();mutate(x);
  assert.throws(()=>inspectAdvancedResearchEnvelope(x));
 }
});
test('real orders, imported paper ledger and imaginary P/L are not trusted',()=>{
 const mutations=[
  x=>{x.liveOrdersEnabled=true;},
  x=>{x.realOrdersPlaced=1;},
  x=>{x.paperLedgerStored=true;},
  x=>{x.paperLedgerImportAllowed=true;},
  x=>{x.strategies[0].feesINR=-1;},
  x=>{x.strategies[0].equity[0].equityINR=Infinity;},
  x=>{x.strategies[0].trades[0].time=1;},
  x=>{x.strategies[0].trades[0].quantity=0;},
  x=>{x.strategies[1].id=x.strategies[0].id;},
  x=>{x.strategies[0].equity[1].time=x.strategies[0].equity[0].time-1;},
 ];
 for(const change of mutations){
  const x=fixture();change(x);
  assert.throws(()=>inspectAdvancedResearchEnvelope(x));
 }
});
test('local file inspector neither uploads nor grants execution rights',()=>{
 const component=readFileSync(new URL('../src/components/AdvancedResearchImport.tsx',import.meta.url),'utf8');
 const lab=readFileSync(new URL('../src/components/StrategyLabPage.tsx',import.meta.url),'utf8');
 assert.match(component,/await file\.text\(\)/);
 assert.match(component,/never uploaded|never uploaded/i);
 assert.doesNotMatch(component,/\bfetch\s*\(|\bFormData\b|localStorage|realOrdersEnabled\s*=\s*true/);
 assert.match(lab,/mode==='research'&&<AdvancedResearchImport\/>/);
});
