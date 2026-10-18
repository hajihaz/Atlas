import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocation, estimateWhatIf, estimateGrowwCharges, verifiedTrades
} from '../src/lib/scalpstormLedger.ts';
import campaign from '../src/data/scalpstorm-campaign.json' with {type:'json'};

test('₹100k is split into 10 slots and margin never creates physical capital',()=>{
  assert.deepEqual([1,2,5].map(n => {
    const x=allocation(n); return [x.capitalPerSlot,x.exposurePerSlot,x.totalExposure,x.borrowedExposure];
  }),[[10000,10000,100000,0],[10000,20000,200000,100000],[10000,50000,500000,400000]]);
});
test('historical data cannot be inferred from a Nifty signal',()=>{
  assert.equal(campaign.verifiedSessions,0);
  assert.equal(campaign.netPnlINR,null);
  for(const day of campaign.days){
    assert.equal(verifiedTrades(day,campaign.verifiedSessions),null);
    assert.equal(day.trades,null);
    assert.equal(day.selected,null);
    assert.equal(day.netPnl,null);
  }
});
test('computed hypothetical gain/loss and costs are separate from actual return',()=>{
  const win=estimateWhatIf(1,1,'BUY');
  const loss=estimateWhatIf(1,-2,'BUY');
  assert.equal(win.grossTotal,1000);
  assert.ok(Math.abs(win.estimatedFeeTotal-272.948606)<0.0001);
  assert.ok(Math.abs(win.estimatedNetTotal-626.551394)<0.0001);
  assert.equal(loss.grossTotal,-2000);
  assert.ok(loss.estimatedNetTotal < -2000);
  assert.equal(win.status,'HYPOTHETICAL_NOT_HISTORICAL');
  assert.equal(estimateWhatIf(2,1).grossTotal,2000);
  assert.equal(estimateWhatIf(5,-2).grossTotal,-10000);
  assert.ok(estimateWhatIf(5,-2).estimatedNetTotal < -10000);
});
test('an example short direction has a benefit when prices fall',()=>{
  assert.equal(estimateWhatIf(1,1,'SELL').grossTotal,1000);
  assert.equal(estimateWhatIf(1,-1,'SELL').grossTotal,-1000);
});
test('the fees have all disclosed components',()=>{
  const result=estimateGrowwCharges(10000,10100);
  assert.equal(result.brokerage,20.1);
  assert.ok(result.gst>0);
  assert.ok(result.stt>0);
  assert.ok(result.stamp>0);
  assert.equal(estimateGrowwCharges(0,0).total,0);
  assert.throws(()=>estimateGrowwCharges(-1,200),RangeError);
  assert.throws(()=>estimateWhatIf(1,Infinity),RangeError);
});
test('fake stock names cannot pass evidence gate or lose their 09:30 requirements',()=>{
  const names=Array.from({length:10},(_,i)=>'STK'+String(i).padStart(2,'0'));
  const trades=names.map(symbol=>({
    symbol, side:'BUY', shares:10, opening_volume:200,
    entry:'100',exit:'101',gross_pnl:'10',estimated_charges:'2',net_pnl:'8',exit_reason:'15:00_TIME_EXIT'
  }));
  const day={...campaign.days[1],status:'STOCK_BACKTEST_VERIFIED',trades,netPnl:'80',selected:names};
  assert.equal(verifiedTrades(day,1),null);
  day.stockEvidence={
    pointInTimeUniverseVerified:true,selectedMinuteBarsComplete:true,
    sourceSha256:'a'.repeat(64),universeSha256:'b'.repeat(64)
  };
  assert.equal(verifiedTrades(day,1)?.length,10);
  assert.equal(verifiedTrades({...day,netPnl:'100'},1),null);
  assert.equal(verifiedTrades({...day,selected:Array(10).fill('STK00')},1),null);
  assert.equal(verifiedTrades({...day,stockEvidence:{...day.stockEvidence,pointInTimeUniverseVerified:false}},1),null);
});
test('user-facing page contains ten-stock columns and a separate month-end ledger', async()=>{
  const {readFileSync}=await import('node:fs');
  const path=new URL('../src/components/ScalpStormLedgerPanels.tsx',import.meta.url);
  const ui=readFileSync(path,'utf8');
  for(const text of ['10-position breakdown','Gross P&L','Net P&L','Margin and profit/loss calculator','End-of-month dashboard','NO TRADE','HYPOTHETICAL ONLY']) {
    assert.ok(ui.includes(text),text);
  }
  assert.ok(!ui.includes('fetch('));
  assert.ok(!ui.includes('placeOrder('));
});
