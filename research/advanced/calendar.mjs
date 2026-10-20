import { requireThat, epoch, freeze } from './core.mjs';
const FROM = '2026-09-18', THROUGH = '2026-10-16';
export const CALENDAR_EVIDENCE = freeze({
  venue: 'NSE', segment: 'Equities', from: FROM, through: THROUGH,
  officialSource: 'https://www.nseindia.com/resources/exchange-communication-holidays',
  checkedAt: '2026-10-20', fullDayHolidaysInWindow: ['2026-10-02'],
  note: 'Official scheduled cash sessions; not proof that historical minute data was obtained.',
});
export const NSE_SESSIONS = freeze((() => {
  const dates = [];
  for (let t = epoch(FROM + 'T00:00:00Z'); t <= epoch(THROUGH + 'T00:00:00Z'); t += 86400000) {
    const d = new Date(t), day = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && day !== '2026-10-02') dates.push(day);
  }
  return dates;
})());
export function sessionTime(session, hour, minute) {
  requireThat(NSE_SESSIONS.includes(session), 'OUTSIDE_VERIFIED_NSE_WINDOW');
  requireThat(Number.isInteger(hour) && hour >= 0 && hour <= 23
    && Number.isInteger(minute) && minute >= 0 && minute <= 59, 'INVALID_SESSION_TIME');
  return epoch(session + 'T' + String(hour).padStart(2, '0') + ':'
    + String(minute).padStart(2, '0') + ':00+05:30');
}
export function minuteGrid(session, fromHour = 9, fromMinute = 15, toHour = 15, toMinute = 1) {
  const from = sessionTime(session, fromHour, fromMinute), to = sessionTime(session, toHour, toMinute);
  requireThat(to > from && from >= sessionTime(session, 9, 15)
    && to <= sessionTime(session, 15, 30), 'INVALID_NSE_MINUTE_GRID');
  return freeze(Array.from({ length: (to - from) / 60000 }, (_, i) => from + i * 60000));
}
