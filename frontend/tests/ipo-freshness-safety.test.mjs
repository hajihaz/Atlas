import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {browserDeadlineCandidates,effectiveStatus,feedAgeMinutes,issueDataFresh,officialAllotmentLinks,recentGmp,recommendation} from '../src/lib/ipoIntelligence.ts';
const now=new Date('2026-10-23T05:00:00.000Z'); // 10:30 IST
const base={
  id:'TEST',company:'Sample IPO Limited',board:'MAINBOARD',openDate:'2026-10-21',closeDate:'2026-10-23',status:'OPEN',
  priceMin:200,priceMax:220,lotSize:65,subscription:{qib:null,nii:null,retail:1.5,individual:null,total:2.1},
  gmp:14,gmpAsOf:'2026-10-23T04:00:00Z',gmpProvider:'Example tracker',gmpDisputed:false,
  sourceObservedAt:'2026-10-23T04:50:00Z',sourceStale:false,
  financials:null,news:[],source:'https://www.nseindia.com/api/',detailSource:'https://www.nseindia.com/market-data',
  bidDeadline:null,mandateDeadline:'2026-10-23T17:00:00+05:30'
};
test('current observed issue allows a source-stamped but unofficial quote',()=>{
 assert.equal(issueDataFresh(base,false,now),true);
 assert.equal(recentGmp(base,false,now).gmp,14);
 assert.equal(browserDeadlineCandidates([base],false,now).length,1);
});
test('global stale feed suppresses quotes and browser alerts',()=>{
 assert.equal(issueDataFresh(base,true,now),false);
 assert.equal(recentGmp(base,true,now),null);
 assert.deepEqual(browserDeadlineCandidates([base],true,now),[]);
});
test('retained BSE record must never send a deadline alert or current GMP',()=>{
 const prior={...base,id:'BSESME-12',board:'SME',sourceStale:true,sourceObservedAt:'2026-10-21T00:00:00Z'};
 assert.equal(issueDataFresh(prior,false,now),false);
 assert.equal(recentGmp(prior,false,now),null);
 assert.deepEqual(browserDeadlineCandidates([prior],false,now),[]);
 assert.match(recommendation(prior,false).label,/SOURCE STALE/);
});
test('GMP expires independently after 36 hours or when timestamp is invalid',()=>{
 assert.equal(recentGmp({...base,gmpAsOf:'2026-10-21T00:00:00Z'},false,now),null);
 assert.equal(recentGmp({...base,gmpAsOf:'bad-time'},false,now),null);
 assert.equal(recentGmp({...base,gmpAsOf:'2026-10-26T01:00:00Z'},false,now),null);
 assert.equal(recentGmp({...base,gmp:null},false,now),null);
 assert.equal(recentGmp({...base,gmp:-3},false,now)?.gmp,-3); // negative GMP is valid evidence
});
test('bid cutoff and mandate cutoff close reminders; unknown provider status never claims OPEN',()=>{
 const early={...base,bidDeadline:'2026-10-23T10:00:00+05:30'};
 assert.equal(effectiveStatus(early,now),'CLOSED');
 assert.deepEqual(browserDeadlineCandidates([early],false,now),[]);
 assert.equal(effectiveStatus({...base,mandateDeadline:'2026-10-23T09:30:00+05:30'},now),'CLOSED');
 assert.equal(effectiveStatus({...base,status:'UNKNOWN'},now),'UNKNOWN');
 assert.deepEqual(browserDeadlineCandidates([{...base,status:'UNKNOWN'}],false,now),[]);
});
test('the frontend shows stale instead of displaying expired GMP and alerting retained issues',()=>{
 const ui=readFileSync(new URL('../src/components/IPOIntelligencePage.tsx',import.meta.url),'utf8');
 assert.match(ui,/const quote=recentGmp\(i,stale\)/);
 assert.match(ui,/const currentGmp=recentGmp\(issue,stale\)/);
 assert.match(ui,/browserDeadlineCandidates\(issues,stale,now\)/);
 assert.match(ui,/currentDemand\?multiple\(issue\.subscription\.total\):'Stale/);
 assert.doesNotMatch(ui,/for\(const i of feed\.issues\).*new Notification/);
});

test('malformed and future-dated global snapshots must never be classified as fresh',()=>{
  const stamped=(generatedAt)=>({generatedAt});
  assert.equal(feedAgeMinutes(stamped('invalid-snapshot'),now),Infinity);
  assert.equal(feedAgeMinutes(stamped('2026-10-24T01:00:00Z'),now),Infinity);
  assert.equal(feedAgeMinutes(stamped(null),now),Infinity);
  assert.equal(feedAgeMinutes(stamped('2026-10-23T04:58:00Z'),now),2);
});

test('allotment links use only official exchange and source-identified registrars',()=>{
  const kfin=officialAllotmentLinks({...base,registrar:'Kfin Technologies Limited'});
  const mufg=officialAllotmentLinks({...base,registrar:'MUFG Intime India Private Limited'});
  const unknown=officialAllotmentLinks({...base,registrar:'Unknown Registrar'});
  assert.match(kfin[0].url,/^https:\/\/ipostatus\.kfintech\.com\//);
  assert.match(mufg[0].url,/^https:\/\/in\.mpms\.mufg\.com\//);
  assert.equal(unknown.length,1);
  assert.match(unknown[0].url,/^https:\/\/www\.bseindia\.com\//);
  assert.ok([...kfin,...mufg,...unknown].every(link=>!link.url.includes('PAN=')&&!link.url.includes('applicationNo=')));
});
