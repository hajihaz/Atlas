import assert from 'node:assert/strict';
import test from 'node:test';
import {applicationBudgetPlan,minimumApplication,recommendation,issueSourceStale} from '../src/lib/ipoIntelligence.ts';
const base={id:'EXAMPLE',company:'Example Ltd',board:'MAINBOARD',openDate:'2026-10-23',closeDate:'2026-11-06',status:'OPEN',priceMin:90,priceMax:100,lotSize:100,
subscription:{qib:null,nii:null,retail:null,individual:null,total:null},gmp:null,gmpAsOf:null,financials:null,news:[],source:'https://www.nseindia.com/',detailSource:'https://www.nseindia.com/',mandateDeadline:null,bidDeadline:null};
test('Mainboard uses verified upper price band per lot, never a fabricated gain',()=>{
  const result=applicationBudgetPlan(base,25000);
  assert.equal(result.minimumLots,1);assert.equal(result.minimumCapital,10000);assert.equal(result.affordableLots,2);assert.equal(result.indicativeOutlay,20000);assert.equal(result.quantity,200);
  assert.equal(minimumApplication(base),10000);
  assert.equal(applicationBudgetPlan(base,2500000).affordableLots,20); // Retail capped at ₹2 lakh
  assert.equal(applicationBudgetPlan({...base,priceMax:250000},2500000),null);
});
test('SME individual requires at least two lots strictly above ₹2 lakh',()=>{
  const sme={...base,board:'SME',lotSize:1000};
  const min=applicationBudgetPlan(sme,250000);
  assert.equal(min.minimumLots,3);assert.equal(min.minimumCapital,300000);
  assert.equal(min.fitsMinimum,false);assert.equal(min.indicativeOutlay,0);
  assert.equal(applicationBudgetPlan({...sme,lotSize:1200},250000).minimumCapital,240000);
});
test('missing lot, invalid budget and stale source remain fail-closed',()=>{
  assert.equal(applicationBudgetPlan({...base,lotSize:null},100000),null);
  assert.equal(applicationBudgetPlan(base,-1),null);
  assert.equal(applicationBudgetPlan(base,Infinity),null);
  assert.equal(issueSourceStale({...base,sourceStale:true}),true);
  assert.match(recommendation({...base,sourceStale:true},false).label,/SOURCE STALE|APPLICATION CLOSED|PRE-OPEN WATCH/);
});
