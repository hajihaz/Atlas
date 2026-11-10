// Read-only, calendar-aware classification of cloud paper reporting evidence.
// Never submits orders, changes archived ledgers, or credits forward sessions.
// Official NSE 2026 schedule: https://www.nseindia.com/resources/exchange-communication-holidays
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { nseSessionAt } from '../frontend/api/market-inr.js';

const isCount = n => Number.isSafeInteger(n) && n >= 0;
const isDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
  && !Number.isNaN(Date.parse(day + 'T00:00:00Z'))
  && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day;

export function auditNsePaperSession({ day, cohort, daybook, accounts }) {
  if (!isDay(day)) throw Error('invalid_session_date');
  if (!cohort || cohort.source_date !== day || !isCount(cohort.expected)
    || !isCount(cohort.archived) || cohort.archived > cohort.expected)
    throw Error('invalid_daily_cohort_evidence');
  if (!daybook || daybook.session !== day
    || !isCount(daybook.entry_snapshot_count)
    || !isCount(daybook.keyed_snapshot_count)
    || typeof daybook.complete_0940_snapshot !== 'boolean')
    throw Error('invalid_daybook_evidence');
  if (!accounts || accounts.paperOnly !== true || accounts.realOrdersEnabled !== false
    || !Array.isArray(accounts.accounts) || accounts.accounts.length === 0
    || accounts.accounts.some(a => !isCount(a.positionCount) || !isCount(a.pendingCount)))
    throw Error('paper_account_safety_not_verified');

  const market = nseSessionAt(Date.parse(day + 'T06:00:00Z'));
  if (market.date !== day) throw Error('exchange_calendar_date_mismatch');
  const openVirtualPositions = accounts.accounts.reduce((n, a) => n + a.positionCount, 0);
  const pendingVirtualOrders = accounts.accounts.reduce((n, a) => n + a.pendingCount, 0);
  const warnings = [];
  if (openVirtualPositions || pendingVirtualOrders) warnings.push('VIRTUAL_EXPOSURE_REQUIRES_REVIEW');

  // 8 November 2026 was Sunday *Muhurat* trading; it is not an ordinary
  // weekend and requires special-session timing and evidence verification.
  const specialMuhurat = day === '2026-11-08';
  const calendarUnknown = market.phase === 'calendar_unverified';
  const regularClosed = market.phase === 'scheduled_holiday' || market.phase === 'weekend';
  const archiveComplete = cohort.expected > 0 && cohort.archived === cohort.expected
    && cohort.status === 'COMPLETE';
  const keyedCoverage = daybook.complete_0940_snapshot === true
    && daybook.keyed_snapshot_count > 0;
  let reportingState;
  let normalSessionEligible = false;
  if (specialMuhurat) {
    reportingState = 'SPECIAL_SESSION_NEEDS_EXPLICIT_CERTIFICATION';
    warnings.push('MUHURAT_TIMING_AND_EXECUTION_UNVERIFIED');
  } else if (calendarUnknown) {
    reportingState = 'CALENDAR_COVERAGE_UNVERIFIED';
    warnings.push('DO_NOT_INFER_MISSING_MARKET_SESSION');
  } else if (regularClosed) {
    reportingState = market.phase === 'scheduled_holiday'
      ? 'EXCHANGE_HOLIDAY_NO_REGULAR_ARCHIVE_EXPECTED'
      : 'WEEKEND_NO_REGULAR_ARCHIVE_EXPECTED';
    if (cohort.archived > 0) warnings.push('NON_REGULAR_DAY_HAS_ARCHIVE_RECEIPTS');
  } else {
    normalSessionEligible = true;
    reportingState = !archiveComplete ? 'REGULAR_DAY_ARCHIVE_INCOMPLETE'
      : !keyedCoverage ? 'REGULAR_DAY_ARCHIVED_ENTRY_EVIDENCE_GATED'
        : 'REGULAR_DAY_SOURCE_COVERAGE_ONLY';
  }
  if (Array.isArray(daybook.strategy_orders) && daybook.strategy_orders.length > 0
    && !normalSessionEligible) warnings.push('NON_REGULAR_DAY_STRATEGY_ORDERS_REVIEW');

  return {
    schema: 'atlas.nse-paper-session-evidence.v1', day,
    exchangePhase: market.phase, reportingState,
    rawArchiveStatus: cohort.status, expectedReceipts: cohort.expected,
    archivedReceipts: cohort.archived, entrySnapshots: daybook.entry_snapshot_count,
    keyedSnapshots: daybook.keyed_snapshot_count,
    normalSessionEligible, regularArchiveComplete: normalSessionEligible && archiveComplete,
    keyedEntryEvidenceComplete: normalSessionEligible && keyedCoverage,
    // Evidence from an archive alone is NEVER permission to increment 15-day trials.
    forwardSessionCredited: false, paperOnly: true, realOrdersEnabled: false,
    virtualAccountCount: accounts.accounts.length,
    openVirtualPositions, pendingVirtualOrders, warnings,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const day = process.argv[2];
  const input = JSON.parse(readFileSync(0, 'utf8'));
  console.log(JSON.stringify(auditNsePaperSession({ day, ...input }), null, 2));
}
