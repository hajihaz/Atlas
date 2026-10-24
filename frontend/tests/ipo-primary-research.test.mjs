import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {mergePrimaryResearch,recommendation} from '../src/lib/ipoIntelligence.ts';
const data=JSON.parse(readFileSync(new URL('../public/ipo-primary-research.json',import.meta.url),'utf8'));
const feed=JSON.parse(readFileSync(new URL('../public/ipo-feed.json',import.meta.url),'utf8'));
test('source research uses strictly SEBI primary filing pages, fiscal units and issuer-only facts',()=>{
 assert.equal(data.schemaVersion,1);
 assert.equal(data.records.length,1);
 const row=data.records[0],f=row.financials;
 assert.equal(row.id,'PARASHLTH');assert.equal(row.board,'MAINBOARD');
 assert.match(f.source,/^https:\/\/www\.sebi\.gov\.in\/sebi_data\/commondocs\//);
 assert.deepEqual(f.sourcePages,[8,9,10,14]);
 assert.equal(f.asOf,'2026-03-31');
 assert.equal(f.revenueFY26Cr,1605.952);
 assert.equal(f.profitFY26Cr,43.834);
 assert.equal(f.profitFY25Cr,-57.983);
 assert.equal(f.borrowingsFY26Cr,854.101);
 assert.equal(f.debtEquity,3.53);
 assert.equal(f.operatingCashflowFY26Cr,163.512);
 assert.equal(f.valuationVerified,false);assert.equal(f.peerComparisonVerified,false);
 assert.equal(f.investmentDecision,'HOLD_FOR_VALUATION_REVIEW');
});
test('primary research only attaches to exact symbol company board and cannot change status',()=>{
 const original=feed.issues.find(i=>i.id==='PARASHLTH');assert.ok(original);
 const [result]=mergePrimaryResearch([original],data);
 assert.equal(result.financials.revenueGrowthPct,24.1);
 assert.equal(result.source,original.source);
 assert.equal(result.status,original.status);
 assert.equal(result.openDate,original.openDate);
 const [wrongName]=mergePrimaryResearch([{...original,company:'Impostor Healthcare'}],data);
 assert.equal(wrongName.financials,null);
 const [wrongBoard]=mergePrimaryResearch([{...original,board:'SME'}],data);
 assert.equal(wrongBoard.financials,null);
 const [wrongSymbol]=mergePrimaryResearch([{...original,id:'OTHER'}],data);
 assert.equal(wrongSymbol.financials,null);
});
test('unverified peer valuation must not yield APPLY or speculative points',()=>{
 const original=feed.issues.find(i=>i.id==='PARASHLTH');
 const now=new Date('2026-10-23T05:00:00Z');
 const [issue]=mergePrimaryResearch([{...original,status:'OPEN',openDate:'2026-10-01',closeDate:'2026-11-30',mandateDeadline:null,
   sourceObservedAt:'2026-10-23T04:50:00Z',sourceStale:false}],data);
 const r=recommendation(issue,false,now);
 assert.match(r.label,/HOLD — VALUATION REVIEW/);assert.equal(r.score,null);
 const [invalid]=mergePrimaryResearch([original],{...data,records:[{...data.records[0],financials:{...data.records[0].financials,source:'https://evil.example/file.pdf'}}]});
 assert.equal(invalid.financials,null);
});
