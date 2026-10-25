/**
 * Fail-closed admission of Atlas Day Trader NSE *synthetic* research snapshots.
 * Never upgrades demo evidence to NSE-certified P/L or sends broker requests.
 */
const MONEY = /^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const REASONS = new Set([
  'target_first', 'stop_first_conservative', 'no_closed_breakout',
  'risk_budget_too_small', 'session_close',
]);

function reject() {
  throw new Error('Synthetic NSE research snapshot unavailable or untrusted');
}
function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function money(value) {
  if (typeof value !== 'string' || value.length > 35 || !MONEY.test(value)) reject();
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > 1e9) reject();
  return n;
}
function isoDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value+'T00:00:00Z'));
}
export function validateDayTraderDemo(input) {
  if (!record(input) || input.report_type !== 'atlas_daytrader_nse_research_only'
      || !record(input.dataset) || input.dataset.kind !== 'synthetic_fixture'
      || input.dataset.session_count !== 20
      || input.dataset.source !== 'locally constructed 75-bar sessions, NOT NSE exchange history'
      || !record(input.safety)
      || input.safety.real_market_certified !== false
      || input.safety.paper_trading_connected !== false
      || input.safety.production_enabled !== false
      || input.safety.live_NSE_data_used !== false
      || input.safety.broker_orders_submitted !== 0
      || !record(input.overview) || input.overview.sessions !== 20
      || !record(input.bootstrap) || input.bootstrap.trials !== 10000
      || input.bootstrap.real_market_certified !== false
      || input.bootstrap.orders_submitted !== 0
      || input.bootstrap.source_class !== 'synthetic_fixture'
      || input.bootstrap.research_only !== true
      || !Array.isArray(input.sessions) || input.sessions.length !== 20
      || !Array.isArray(input.dataset.sessions) || input.dataset.sessions.length !== 20) reject();
  const seen = new Set();
  const rows = input.sessions.map(row=>{
    if (!record(row) || !isoDay(row.session) || seen.has(row.session)
        || !REASONS.has(row.reason) || row.data_class !== 'synthetic_fixture'
        || row.orders_submitted !== 0 || !Number.isSafeInteger(row.shares)
        || row.shares < 0 || typeof row.decision_hash !== 'string'
        || !/^[a-f0-9]{64}$/.test(row.decision_hash)
        || typeof row.source_hash !== 'string'
        || !/^[a-f0-9]{64}$/.test(row.source_hash)) reject();
    seen.add(row.session);
    return {
      session:row.session,reason:row.reason,shares:row.shares,
      entry:row.entry===null ? null : money(row.entry),
      exit:row.exit===null ? null : money(row.exit),
      netPnl:money(row.net_pnl),
    };
  });
  if (rows.some((x,i)=>x.session!==input.dataset.sessions[i])
      || rows.some((x,i)=>i>0 && rows[i-1].session>=x.session)) reject();
  const totalNet = money(input.overview.total_net_pnl_inr_demo_only);
  if (Math.abs(totalNet-rows.reduce((sum,x)=>sum+x.netPnl,0))>0.02) reject();
  const mc=input.bootstrap;
  const p05=money(mc.p05_net_pnl_inr),median=money(mc.median_net_pnl_inr),
    p95=money(mc.p95_net_pnl_inr);
  if (p05>median || median>p95
      || typeof mc.positive_resample_fraction!=='number'
      || !Number.isFinite(mc.positive_resample_fraction)
      || mc.positive_resample_fraction<0 || mc.positive_resample_fraction>1) reject();
  return {
    sessions:rows,
    totalNet,
    monteCarlo:{
      trials:10000,p05,median,p95,positiveFraction:mc.positive_resample_fraction,
      seed:mc.seed,
    },
    safetyLabel:'SYNTHETIC ONLY — invented data, no real NSE returns or trades',
  };
}
