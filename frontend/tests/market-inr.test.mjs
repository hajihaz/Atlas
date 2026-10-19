import assert from 'node:assert/strict';
import test from 'node:test';
import handler, { getINRSnapshot, nseSessionAt, parseIndicativeINR } from '../api/market-inr.js';

const sample={data:{amount:'7865432.75',currency:'INR'}};
test('direct INR reference is kept INR without guessing exchange rates',()=>{
  const row=parseIndicativeINR(sample,{symbol:'BTC/INR',label:'Bitcoin'},'2026-10-19T02:12:00.000Z');
  assert.equal(row.price,7865432.75);
  assert.equal(row.currency,'INR');
  assert.equal(row.observedAt,null);
  assert.equal(row.paperEligible,false);
  assert.equal(row.status,'indicative_reference_time_unverified');
});
test('foreign fiat and invalid amounts must fail closed',()=>{
  for(const value of ['0','-1','NaN','Infinity','no-price']){
    assert.throws(()=>parseIndicativeINR({data:{amount:value,currency:'INR'}},{symbol:'BTC/INR'},''));
  }
  assert.throws(()=>parseIndicativeINR({data:{amount:'100',currency:'USD'}},{symbol:'BTC/INR'},''));
});
test('Monday 19 October before NSE regular session is not open',()=>{
  const session=nseSessionAt(Date.parse('2026-10-19T02:12:00Z'));
  assert.equal(session.date,'2026-10-19');
  assert.equal(session.phase,'before_preopen');
  assert.equal(session.exchangeVerifiedOpen,false);
  assert.equal(session.regularHoursIST,'09:15–15:30');
});
test('scheduled hours and published NSE 20 October holiday are distinguished',()=>{
  assert.equal(nseSessionAt(Date.parse('2026-10-19T05:00:00Z')).phase,'scheduled_regular_hours');
  assert.equal(nseSessionAt(Date.parse('2026-10-20T05:00:00Z')).phase,'scheduled_holiday');
  assert.equal(nseSessionAt(Date.parse('2026-10-18T05:00:00Z')).phase,'weekend');
  assert.equal(nseSessionAt(Date.parse('2027-10-19T05:00:00Z')).phase,'calendar_unverified');
});
test('two fixed public Coinbase INR source paths, never quote forwarding or credentials',async()=>{
  const requested=[];
  const fake=async(url,options)=>{
    requested.push(url);
    assert.equal(options.method,'GET');
    assert.ok(!JSON.stringify(options).includes('Authorization'));
    return {ok:true,json:async()=>sample};
  };
  const result=await getINRSnapshot(fake,Date.parse('2026-10-19T02:12:00Z'));
  assert.deepEqual(requested.sort(),[
    'https://api.coinbase.com/v2/prices/BTC-INR/spot',
    'https://api.coinbase.com/v2/prices/ETH-INR/spot'
  ].sort());
  assert.ok(result.crypto.every(row=>row.price===7865432.75&&row.currency==='INR'));
  assert.ok(result.equities.every(row=>row.price===null&&row.currency==='INR'));
  assert.equal(result.realPortfolio.valueINR,null);
  assert.equal(result.realPortfolio.pnlINR,null);
  assert.equal(result.liveOrdersEnabled,false);
  assert.equal(result.paperExecutionEnabled,false);
});
test('unreachable provider never supplies fabricated price, zero gain, or trading privileges',async()=>{
  const result=await getINRSnapshot(async()=>{throw Error('provider down');},Date.parse('2026-10-19T02:25:00Z'));
  assert.equal(result.providerStatus,'unavailable');
  assert.ok(result.crypto.every(row=>row.price===null));
  assert.ok(result.equities.every(row=>row.price===null));
  assert.equal(result.realPortfolio.tradesVerified,null);
});
test('POST order attempts are rejected without contacting upstream',async()=>{
  let code=0;const headers={};
  const res={setHeader(k,v){headers[k]=v;},status(status){code=status;return this;},json(v){return v;}};
  const body=await handler({method:'POST',body:{symbol:'BTC-INR',side:'BUY'}},res);
  assert.equal(code,405);
  assert.equal(headers.Allow,'GET');
  assert.equal(body.error,'method_not_allowed');
});
