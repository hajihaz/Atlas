// NSE capital-market calendar for ordinary daytime sessions, including the January election closure.
// Source: NSE/CMTR/71775 and the exchange's 15 January 2026 holiday update.
const NSE_2026_HOLIDAYS = new Set([
  '2026-01-15','2026-01-26','2026-03-03','2026-03-26','2026-03-31',
  '2026-04-03','2026-04-14','2026-05-01','2026-05-28','2026-06-26',
  '2026-09-14','2026-10-02','2026-10-20','2026-11-10','2026-11-24','2026-12-25',
]);

export function nseDayClosure(day, weekend) {
  if (weekend) return 'weekend';
  if (!day.startsWith('2026-')) return 'calendar_unverified';
  return NSE_2026_HOLIDAYS.has(day) ? 'scheduled_holiday' : null;
}
