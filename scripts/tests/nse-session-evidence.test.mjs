import test from 'node:test';
import assert from 'node:assert/strict';
import { auditNsePaperSession } from '../audit_nse_session.mjs';

const accounts = {paperOnly:true,realOrdersEnabled:false,accounts:[
  {strategyId:'scalpstorm_x',positionCount:0,pendingCount:0},
  {strategyId:'vwap_precision',positionCount:0,pendingCount:0},
]};
const make = (day, overrides={}) => ({
  day,
  cohort:{source_date:day,status:'COMPLETE',expected:10,archived:10},
  daybook:{session:day,entry_snapshot_count:1373,keyed_snapshot_count:0,
    complete_0940_snapshot:false,strategy_orders:[]},
  accounts,
  ...overrides,
});

test('NSE holiday 2026-11-10 is not falsely counted as a failed regular session',()=>{
  const actual=auditNsePaperSession(make('2026-11-10',{
    cohort:{source_date:'2026-11-10',status:'INCOMPLETE',expected:10,archived:0},
    daybook:{session:'2026-11-10',entry_snapshot_count:0,keyed_snapshot_count:0,
      complete_0940_snapshot:false,strategy_orders:[],
      phases:[{phase:'EXIT',status:'EXECUTED'}]},
  }));
  assert.equal(actual.exchangePhase,'scheduled_holiday');
  assert.equal(actual.reportingState,'EXCHANGE_HOLIDAY_NO_REGULAR_ARCHIVE_EXPECTED');
  assert.equal(actual.rawArchiveStatus,'INCOMPLETE');
  assert.equal(actual.regularArchiveComplete,false);
  assert.equal(actual.normalSessionEligible,false);
  assert.equal(actual.forwardSessionCredited,false);
  assert.equal(actual.openVirtualPositions,0);
});

test('real NSE day 2026-11-09 distinguishes complete archive from missing keyed coverage',()=>{
  const actual=auditNsePaperSession(make('2026-11-09'));
  assert.equal(actual.reportingState,'REGULAR_DAY_ARCHIVED_ENTRY_EVIDENCE_GATED');
  assert.equal(actual.regularArchiveComplete,true);
  assert.equal(actual.keyedEntryEvidenceComplete,false);
  assert.equal(actual.normalSessionEligible,true);
  assert.equal(actual.forwardSessionCredited,false);
});

test('a complete keyed snapshot is coverage, never automatic strategy certification',()=>{
  const input=make('2026-11-09');
  input.daybook.keyed_snapshot_count=1373;
  input.daybook.complete_0940_snapshot=true;
  const actual=auditNsePaperSession(input);
  assert.equal(actual.reportingState,'REGULAR_DAY_SOURCE_COVERAGE_ONLY');
  assert.equal(actual.forwardSessionCredited,false);
});

test('ordinary missing trading-day archive is still a real gap',()=>{
  const input=make('2026-11-09');
  input.cohort={source_date:'2026-11-09',expected:10,archived:0,status:'INCOMPLETE'};
  const actual=auditNsePaperSession(input);
  assert.equal(actual.reportingState,'REGULAR_DAY_ARCHIVE_INCOMPLETE');
  assert.equal(actual.regularArchiveComplete,false);
});

test('Sunday Diwali Muhurat session requires explicit special-session evidence',()=>{
  const input=make('2026-11-08');
  input.cohort={source_date:'2026-11-08',status:'INCOMPLETE',expected:10,archived:0};
  const actual=auditNsePaperSession(input);
  assert.equal(actual.reportingState,'SPECIAL_SESSION_NEEDS_EXPLICIT_CERTIFICATION');
  assert.equal(actual.normalSessionEligible,false);
  assert.equal(actual.forwardSessionCredited,false);
  assert.ok(actual.warnings.includes('MUHURAT_TIMING_AND_EXECUTION_UNVERIFIED'));
});

test('ordinary Sunday does not get a regular session',()=>{
  const actual=auditNsePaperSession(make('2026-11-15'));
  assert.equal(actual.reportingState,'WEEKEND_NO_REGULAR_ARCHIVE_EXPECTED');
  assert.equal(actual.forwardSessionCredited,false);
});

test('calendar beyond verified 2026 coverage is fail closed',()=>{
  const actual=auditNsePaperSession(make('2027-11-10'));
  assert.equal(actual.reportingState,'CALENDAR_COVERAGE_UNVERIFIED');
  assert.equal(actual.forwardSessionCredited,false);
});

test('nonregular day with strategy orders cannot silently pass',()=>{
  const input=make('2026-11-10');
  input.daybook.strategy_orders=[{strategyId:'scalpstorm_x'}];
  const actual=auditNsePaperSession(input);
  assert.ok(actual.warnings.includes('NON_REGULAR_DAY_STRATEGY_ORDERS_REVIEW'));
});

test('open or pending virtual exposures remain flagged',()=>{
  const input=make('2026-11-09',{
    accounts:{paperOnly:true,realOrdersEnabled:false,
      accounts:[{positionCount:2,pendingCount:1}]},
  });
  const actual=auditNsePaperSession(input);
  assert.equal(actual.openVirtualPositions,2);
  assert.equal(actual.pendingVirtualOrders,1);
  assert.ok(actual.warnings.includes('VIRTUAL_EXPOSURE_REQUIRES_REVIEW'));
});

test('rejects enabled live orders or nonpaper accounts',()=>{
  for(const bad of [{paperOnly:false,realOrdersEnabled:false,accounts:[]},
    {paperOnly:true,realOrdersEnabled:true,accounts:[{positionCount:0,pendingCount:0}]},
    {paperOnly:true,realOrdersEnabled:false,accounts:[{positionCount:-1,pendingCount:0}]}]){
    assert.throws(()=>auditNsePaperSession(make('2026-11-09',{accounts:bad})),
      /paper_account_safety_not_verified/);
  }
});

test('rejects inconsistent or malformed session receipts and date',()=>{
  for(const day of ['2026-02-30','2026-13-01','2026-11-10T12:00:00Z'])
    assert.throws(()=>auditNsePaperSession(make(day)),/invalid_session_date/);
  const wrong=make('2026-11-09');
  wrong.cohort.source_date='2026-11-10';
  assert.throws(()=>auditNsePaperSession(wrong),/invalid_daily_cohort_evidence/);
  const impossible=make('2026-11-09');
  impossible.cohort.archived=11;
  assert.throws(()=>auditNsePaperSession(impossible),/invalid_daily_cohort_evidence/);
  const invalid=make('2026-11-09');
  invalid.daybook.entry_snapshot_count=-1;
  assert.throws(()=>auditNsePaperSession(invalid),/invalid_daybook_evidence/);
});
