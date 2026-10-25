import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatedReviews,mergeIssuerReviews,historicalPEScenario} from '../src/lib/ipoIssuerResearch.ts';
import {recommendation} from '../src/lib/ipoIntelligence.ts';
const data=JSON.parse(readFileSync(new URL('../public/ipo-issuer-reviews.json',import.meta.url),'utf8'));
const feed=JSON.parse(readFileSync(new URL('../public/ipo-feed.json',import.meta.url),'utf8'));
const now=new Date('2026-10-26T04:00:00Z');
function original(id='BLSPOLY'){
 const i=feed.issues.find(i=>i.id===id);
 return {...i,sourceStale:false,sourceObservedAt:now.toISOString()};
}
test('reviewed numbers keep crore conversions and standalone / consolidated / net-debt bases explicit',()=>{
 const rows=validatedReviews(data,now);assert.equal(rows.length,8);
 const by=id=>rows.find(r=>r.id===id);
 const value=(r,key)=>r.metrics.find(m=>m.key===key)?.value;
 assert.equal(value(by('BLSPOLY'),'revenue'),349.4283);
 assert.equal(value(by('SFCTECH'),'cfo'),-25.802);
 assert.equal(value(by('SFCTECH'),'netDebtEquity'),0.05);
 assert.equal(value(by('SFCTECH'),'debtEquity'),undefined);
 assert.equal(value(by('XFLOT-wisconindustries-ipo'),'cfo'),-20.0099);
 assert.match(by('XFLOT-wisconindustries-ipo').basis,/earlier years standalone/);
 assert.equal(value(by('XFLOT-carverroboweld-ipo'),'dilutedEPS'),3.78);
 assert.match(by('XFLOT-carverroboweld-ipo').basis,/Standalone/);
});
test('research cannot attach to a different company, board or offer window or overwrite source clocks',()=>{
 const input=original();const [joined]=mergeIssuerReviews([input],data,now);
 assert.ok(joined.issuerReview);assert.equal(joined.sourceObservedAt,input.sourceObservedAt);
 assert.equal(joined.priceMax,input.priceMax);assert.equal(joined.financials,input.financials);
 for(const change of [{company:'Different Issuer'},{board:'SME'},{id:'UNKNOWN'},{openDate:'2026-10-01'},{closeDate:'2026-11-30'}]){
  const [wrong]=mergeIssuerReviews([{...input,...change}],data,now);assert.equal(wrong.issuerReview,undefined);
 }
 const [forged]=mergeIssuerReviews([{...input,issuerReview:{decision:'APPLY'}}],null,now);
 assert.equal(forged.issuerReview,undefined);
});
test('unsafe, ambiguous and unattributed research fails closed',()=>{
 const base=structuredClone(data.records[0]);
 for(const mutate of [
  r=>r.sources[0].url='https://www.sebi.gov.in.evil.invalid/file.pdf',
  r=>r.sources[0].sha256='not-a-document-hash',
  r=>r.metrics[0].value=Infinity,
  r=>r.metrics[0].page=1499,
  r=>r.closeDate='2026-02-31',
  r=>r.reviewedAt='2099-01-01T00:00:00Z',
  r=>r.decision='APPLY',
  r=>r.peerContext.peers[0].reportedPE=NaN,
 ]){
  const r=structuredClone(base);mutate(r);assert.deepEqual(validatedReviews({schemaVersion:1,records:[r]},now),[]);
 }
 assert.deepEqual(validatedReviews({schemaVersion:1,records:[base,base]},now),[]);
});
test('P/E is historical arithmetic only and disappears with stale prices, wrong periods or draft evidence',()=>{
 const [issue]=mergeIssuerReviews([original()],data,now);
 const pe=historicalPEScenario(issue,false,now);assert.ok(pe);
 assert.ok(Math.abs(pe.high-150/5.99)<1e-9);
 assert.equal(historicalPEScenario(issue,true,now),null);
 assert.equal(historicalPEScenario({...issue,sourceObservedAt:'2026-10-01T00:00:00Z'},false,now),null);
 assert.equal(historicalPEScenario({...issue,priceMin:-1},false,now),null);
 const quarterly=structuredClone(issue);quarterly.issuerReview.metrics.find(m=>m.key==='dilutedEPS').periodEnd='2026-06-30';
 assert.equal(historicalPEScenario(quarterly,false,now),null);
 const draft=structuredClone(issue);draft.issuerReview.stage='DRAFT_ONLY';
 assert.equal(historicalPEScenario(draft,false,now),null);
 assert.doesNotMatch(recommendation(issue,false,now).label,/APPLY NOW/);
 assert.equal(recommendation(issue,false,now).score,null);
});

test('EAAA current RHP keeps annual and quarterly facts distinct and only exposes historical P/E arithmetic',()=>{
 const row=data.records.find(r=>r.id==='EDELALTS');
 assert.equal(row.stage,'CURRENT_RHP');assert.equal(row.metrics.length,11);
 assert.equal(row.metrics.find(m=>m.key==='cfo').value,235.244);
 assert.equal(row.metrics.find(m=>m.key==='quarterCFO').value,130.384);
 assert.equal(row.metrics.find(m=>m.key==='quarterRevenue').periodEnd,'2026-06-30');
 assert.equal(row.metrics.find(m=>m.key==='dilutedEPS').periodEnd,'2026-03-31');
 assert.equal(row.metrics.find(m=>m.key==='patMargin').label,'PAT / total income');
 assert.equal(row.peerContext.priceAsOf,'2026-10-08');
 assert.ok(!row.peerContext.peers.some(p=>p.company.startsWith('Gaja')));
 const input=original('EDELALTS');const [issue]=mergeIssuerReviews([input],data,now);
 assert.ok(issue.issuerReview);assert.equal(issue.sourceObservedAt,input.sourceObservedAt);
 const pe=historicalPEScenario(issue,false,now);assert.ok(pe);
 assert.ok(Math.abs(pe.low-1585/40.36)<1e-9);assert.ok(Math.abs(pe.high-1665/40.36)<1e-9);
 assert.equal(recommendation(issue,false,now).score,null);assert.doesNotMatch(recommendation(issue,false,now).label,/APPLY NOW/);
 const draft=structuredClone(issue);draft.issuerReview.stage='DRAFT_ONLY';
 assert.equal(historicalPEScenario(draft,false,now),null);
 for(const url of [row.sources[0].url.replace('www.axiscapital.co.in','www.axiscapital.co.in.evil.invalid'),row.sources[0].url.replace('1792429309','1792429308')]){
  const broken=structuredClone(row);broken.sources[0].url=url;
  assert.deepEqual(validatedReviews({schemaVersion:1,records:[broken]},now),[]);
 }
 const fakeCurrent=structuredClone(row);for(const s of fakeCurrent.sources)s.document='DRHP_ADDENDUM';
 assert.deepEqual(validatedReviews({schemaVersion:1,records:[fakeCurrent]},now),[]);
});
