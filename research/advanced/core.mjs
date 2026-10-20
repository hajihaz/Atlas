// Original Atlas research code. No packages, network, credentials or order adapters.
import { createHash } from 'node:crypto';

export class ResearchError extends Error {
  constructor(code, detail = code) { super(detail); this.name = 'ResearchError'; this.code = code; }
}
export function requireThat(condition, code, detail) {
  if (!condition) throw new ResearchError(code, detail);
}
export function finite(value, name, { min = -Infinity, max = Infinity } = {}) {
  requireThat(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max,
    'INVALID_NUMBER', name + ' must be a finite number in range');
  return value;
}
export function integer(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  finite(value, name, { min, max });
  requireThat(Number.isSafeInteger(value), 'INVALID_INTEGER', name);
  return value;
}
export function epoch(value, unit = 'ms') {
  requireThat(unit === 'ms' || unit === 's', 'INVALID_TIME_UNIT');
  if (typeof value === 'number') {
    return integer(unit === 's' ? value * 1000 : value, 'timestamp', { min: 1 });
  }
  requireThat(unit === 'ms' && typeof value === 'string'
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value),
    'AMBIGUOUS_TIMESTAMP', 'Use epoch milliseconds or an ISO timestamp with explicit offset');
  const [year, month, day, hour, minute, second] = value.slice(0, 19).match(/\d+/g).map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  requireThat(calendarDate.getUTCFullYear() === year && calendarDate.getUTCMonth() === month - 1
    && calendarDate.getUTCDate() === day && hour < 24 && minute < 60 && second < 60,
    'INVALID_CALENDAR_TIMESTAMP');
  return integer(Date.parse(value), 'timestamp', { min: 1 });
}
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    requireThat(Number.isFinite(value), 'NONFINITE_JSON');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonical);
  requireThat(value && Object.getPrototypeOf(value) === Object.prototype, 'INVALID_JSON_VALUE');
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
export const stableStringify = value => JSON.stringify(canonical(value));
export const digest = value => createHash('sha256').update(stableStringify(value)).digest('hex');
export const rawDigest = value => createHash('sha256').update(value).digest('hex');
export function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}
export const round = (value, places = 8) => Number(value.toFixed(places));
export function cents(value, direction = 'nearest') {
  finite(value, 'money');
  const scaled = value * 100;
  const result = direction === 'up' ? Math.ceil(scaled - 1e-8)
    : direction === 'down' ? Math.floor(scaled + 1e-8) : Math.round(scaled);
  requireThat(Number.isSafeInteger(result), 'MONEY_OVERFLOW');
  return result;
}
export function safeUrl(value, fixture = false) {
  requireThat(typeof value === 'string' && value.length <= 2048, 'INVALID_SOURCE_URL');
  let url;
  try { url = new URL(value); } catch { throw new ResearchError('INVALID_SOURCE_URL'); }
  requireThat((url.protocol === 'https:' || (fixture && url.protocol === 'fixture:'))
    && !url.username && !url.password, 'INVALID_SOURCE_URL');
  requireThat(![...url.searchParams.keys()].some(key =>
    /^(?:access_token|api_?key|token|secret|signature)$/i.test(key)), 'SENSITIVE_SOURCE_URL');
  return url.href;
}
export const compareIds = (a, b) => a < b ? -1 : a > b ? 1 : 0;
