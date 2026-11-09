import { check } from './normalize.mjs';

// Frozen source-backed planning facts, not an acquisition client or promise of eligibility.
export const PROVIDERS = Object.freeze({
  UPSTOX: { source: 'https://upstox.com/developer/api-documentation/rate-limiting/',
    dataRequestsPerSecond: 50, dataRequestsPerMinute: 500, dataRequestsPer30Minutes: 2000,
    dataRequestsPerDay: null, maxHistoricalCalendarDaysPerRequest: 28,
    fullFeedSymbols: 2000, fullFeedMixedModeSymbols: 1500, accountRequired: true,
    privateUseGuidance: 'https://community.upstox.com/t/clarification-on-storing-upstox-nse-market-data-locally-for-private-research-backtesting/18112',
    caveat: 'Use 28-day chunks conservatively within the documented one-month limit. Back-adjustment and missing historical identity remain certification barriers.' },
  FYERS_STANDARD: { source: 'https://fyers.in/api-docs/v3/getting-started/plans-and-limits/',
    dataRequestsPerSecond: 5, dataRequestsPerMinute: 50, dataRequestsPer30Minutes: null,
    dataRequestsPerDay: 5000, maxHistoricalCalendarDaysPerRequest: 100,
    fullFeedSymbols: 100, fullFeedMixedModeSymbols: 100, accountRequired: true,
    caveat: 'Standard one-year intraday retention; all Data APIs share the budget. Account and intended-use rights must be confirmed.' },
});
export function planAcquisition({ provider, instruments, calendarDays = 29, sessions = 20 }) {
  const p = PROVIDERS[provider];
  check(p && Number.isSafeInteger(instruments) && instruments >= 10 && instruments <= 10000
    && Number.isSafeInteger(calendarDays) && calendarDays > 0 && calendarDays <= 366
    && Number.isSafeInteger(sessions) && sessions > 0 && sessions <= calendarDays, 'INVALID_ACQUISITION_SCENARIO');
  const requests = instruments * Math.ceil(calendarDays / p.maxHistoricalCalendarDaysPerRequest);
  const sustainablePerMinute = Math.min(p.dataRequestsPerSecond * 60, p.dataRequestsPerMinute,
    p.dataRequestsPer30Minutes === null ? Infinity : p.dataRequestsPer30Minutes / 30);
  const pollRequestsPerMinute = instruments;
  return { schema: 'atlas.nse-acquisition-plan.v1', scenarioOnly: true, observedEligibleStockCount: null,
    provider, instruments, calendarDays, sessions, source: p.source, historicalRequests: requests,
    conservativeSustainableMinutes: Math.ceil(requests / sustainablePerMinute),
    minimumQuotaDays: p.dataRequestsPerDay === null ? null : Math.ceil(requests / p.dataRequestsPerDay),
    fullMarketSocketFitsSingleMode: instruments <= p.fullFeedSymbols,
    fullMarketMinuteHistoryPollingFits: pollRequestsPerMinute <= sustainablePerMinute
      && (p.dataRequestsPerDay === null || pollRequestsPerMinute * 375 <= p.dataRequestsPerDay),
    minuteHistoryPollingRequestsPerSession: pollRequestsPerMinute * 375,
    expectedStockMinuteRows: instruments * sessions * 375,
    ownerLoginPerformed: false, requestsSent: 0, additionalSpendINR: 0,
    prerequisite: 'Permitted account/export access plus dated full eligibility and recorded publication evidence. No automatic broker login or acquisition.',
    caveat: p.caveat };
}
