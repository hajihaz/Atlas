import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const live = read('../src/components/LiveLabPage.tsx');
const market = read('../src/components/RealMarketPage.tsx');
const css = read('../src/styles.css');

test('India clock uses 12-hour seconds with explicit uppercase AM/PM', () => {
  const clock = (iso) => new Intl.DateTimeFormat('en-US', {
    timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit',
    second:'2-digit',hour12:true,
  }).format(new Date(iso));
  assert.equal(clock('2026-10-19T11:03:10.000Z'), '4:33:10 PM');
  assert.equal(clock('2026-10-18T18:30:00.000Z'), '12:00:00 AM');
  assert.equal(clock('2026-10-19T06:30:00.000Z'), '12:00:00 PM');
  assert.match(live, /const CLOCK=new Intl.DateTimeFormat/);
  assert.ok(live.includes("timeZone:'Asia/Kolkata'"));
  assert.match(live, /second:'2-digit',hour12:true/);
  assert.doesNotMatch(live,/hour12:false/);
});
test('observations and market timestamps also show 12-hour labels', () => {
  assert.match(live,/hour12:true/);
  assert.match(live,/second:'2-digit',hour12:true/);
  assert.match(market,/toLocaleString\('en-US'/);
  assert.match(market,/hour12:true/);
  assert.match(market,/function nseDisplayTime\(/);
  assert.match(market,/sessionText\(data.nse.phase\)/);
  assert.match(market,/9:15 AM–3:30 PM IST/);
  assert.doesNotMatch(market,/09:15–15:30 IST/);
});
test('clock still ticks once per second and maintains all trade gates', () => {
  assert.match(live,/setInterval\(\(\)=>setNow\(Date.now\(\)\),1000\)/);
  assert.match(live,/paperExecutionEnabled!==false/);
  assert.match(live,/realOrdersEnabled!==false/);
  assert.match(css,/font-variant-numeric:tabular-nums;white-space:nowrap/);
});
