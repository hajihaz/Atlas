import test from 'node:test';
import assert from 'node:assert/strict';
import { NSE_SESSIONS, sessionTime } from '../../research/advanced/calendar.mjs';
import { selectScalpStorm, runScalpStormDay, runScalpStormCampaign } from '../../research/advanced/scalpstorm.mjs';
import { makeScalpDay } from './scalpstorm-fixtures.mjs';
test('requested window has 20 scheduled cash sessions and excludes Gandhi Jayanti', () => {
  assert.equal(NSE_SESSIONS.length, 20);
  assert.equal(NSE_SESSIONS[0], '2026-09-18');
  assert.equal(NSE_SESSIONS.at(-1), '2026-10-16');
  assert.ok(!NSE_SESSIONS.includes('2026-10-02'));
  assert.throws(() => sessionTime('2026-10-02', 9, 15), { code: 'OUTSIDE_VERIFIED_NSE_WINDOW' });
});
test('selection uses completed opening share volume and deterministic ties', () => {
  const day = makeScalpDay(), result = selectScalpStorm(day);
  assert.equal(result.selected.length, 10);
  assert.equal(result.selected[0].id, 'FIXTURE_STOCK_00');
  assert.equal(result.nominalAllocationINR, 10000);
  assert.equal(result.selected[0].cumulativeShareVolume, 11200 * 15);
});
test('future full-day volume cannot improve a stock opening rank', () => {
  const day = makeScalpDay(), before = selectScalpStorm(day).selected.map(row => row.id);
  day.datasets.at(-1).candles[100].volume = 1e12;
  assert.deepEqual(selectScalpStorm(day).selected.map(row => row.id), before);
});
test('missing opening data for an unselected candidate rejects the ranking', () => {
  const day = makeScalpDay(), data = day.datasets.at(-1);
  data.candles.splice(0, 1); data.expectedTimes.splice(0, 1);
  assert.throws(() => selectScalpStorm(day), { code: 'INCOMPLETE_POINT_IN_TIME_VOLUME' });
});
test('a universe chosen at market open is rejected as preopen evidence', () => {
  const day = makeScalpDay();
  day.universe.knownAt = sessionTime(day.session, 9, 15);
  day.universe.provenance.retrievedAt = sessionTime(day.session, 9, 15);
  assert.throws(() => selectScalpStorm(day), { code: 'PREOPEN_UNIVERSE_REQUIRED' });
});
test('late publication of opening minute volume cannot be used at 09:30', () => {
  const day = makeScalpDay();
  day.datasets[0].candles[14].availableAt = sessionTime(day.session, 9, 31);
  assert.throws(() => selectScalpStorm(day), { code: 'INCOMPLETE_POINT_IN_TIME_VOLUME' });
});
test('whole-share allocation, two-side costs and unused cash reconcile', () => {
  const day = makeScalpDay(), result = runScalpStormDay(day);
  assert.equal(result.status, 'COMPLETE_DECLARED_INPUT');
  assert.equal(result.dataKind, 'SYNTHETIC_FIXTURE');
  assert.equal(result.stocks.length, 10);
  for (const stock of result.stocks) {
    assert.ok(Number.isInteger(stock.entryQuantity));
    assert.ok(stock.usedCapitalINR <= 10000);
    assert.equal(Math.round((stock.grossPnlINR - stock.feesINR) * 100), Math.round(stock.netPnlINR * 100));
    assert.equal(stock.fills[0].time, sessionTime(day.session, 9, 40));
    assert.equal(stock.fills.at(-1).time, sessionTime(day.session, 15, 0));
  }
  assert.equal(result.realOrdersPlaced, 0);
});
test('missing selected-stock trading minute blocks the day rather than interpolating', () => {
  const day = makeScalpDay(), data = day.datasets[0];
  data.candles.splice(40, 1); data.expectedTimes.splice(40, 1);
  assert.throws(() => runScalpStormDay(day), { code: 'MISSING_NSE_CANDLE' });
});
test('insufficient exit liquidity leaves an explicit unresolved position and null day profit', () => {
  const day = makeScalpDay();
  for (const data of day.datasets) data.candles.find(row => row.time === sessionTime(day.session, 14, 59)).volume = 0;
  const result = runScalpStormDay(day);
  assert.equal(result.status, 'INCOMPLETE_UNLIQUIDATED');
  assert.equal(result.netPnlINR, null);
  assert.ok(result.stocks.every(row => row.openQuantity > 0));
});
test('flat index produces zero simulated trades and preserves all virtual cash', () => {
  const result = runScalpStormDay(makeScalpDay({ direction: 0 }));
  assert.equal(result.direction, 'NO_TRADE');
  assert.equal(result.netPnlINR, 0);
  assert.equal(result.unusedCashINR, 100000);
  assert.ok(result.stocks.every(row => row.fills.length === 0));
});
test('short scenarios require explicit eligibility and remain fully collateralized simulations', () => {
  const day = makeScalpDay({ direction: -1 });
  assert.throws(() => runScalpStormDay(day), { code: 'SHORT_ELIGIBILITY_UNVERIFIED' });
  const result = runScalpStormDay({ ...day, shortModelEnabled: true });
  assert.equal(result.direction, 'SELL');
  assert.ok(result.stocks.every(row => row.usedCapitalINR <= 10000 && row.fills[0].side === 'SELL'));
});
test('no authentic input produces a blocked campaign with null historical profit', () => {
  const result = runScalpStormCampaign();
  assert.equal(result.status, 'BLOCKED_MISSING_AUTHENTIC_HISTORY');
  assert.equal(result.historicalNetPnlINR, null);
  assert.equal(result.missingSessions.length, 20);
  assert.equal(result.authenticPerformancePublished, false);
});
test('fixture campaign remains a fixture, includes recurring stocks and refuses duplicate days', () => {
  const days = [makeScalpDay(), makeScalpDay({ session: '2026-09-21' })];
  const result = runScalpStormCampaign({ days });
  assert.equal(result.status, 'FIXTURE_ONLY');
  assert.equal(result.historicalNetPnlINR, null);
  assert.equal(result.recurringStocks[0].selections, 2);
  assert.equal(result.missingSessions.length, 18);
  assert.throws(() => runScalpStormCampaign({ days: [days[0], days[0]] }),
    { code: 'DUPLICATE_CAMPAIGN_SESSION' });
});
test('an incomplete day prevents later cumulative results from hiding the unresolved position', () => {
  const first = makeScalpDay();
  for (const data of first.datasets)
    data.candles.find(row => row.time === sessionTime(first.session, 14, 59)).volume = 0;
  const result = runScalpStormCampaign({ days: [first, makeScalpDay({ session: '2026-09-21' })] });
  assert.ok(result.daily.every(row => row.cumulativeModeledNetPnlINR === null));
  assert.equal(result.fixtureSummary.cumulativeModeledNetPnlINR, null);
});
