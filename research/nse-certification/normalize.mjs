import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { NSE_SESSIONS, sessionTime } from '../advanced/calendar.mjs';

export class CertificationError extends Error {
  constructor(code, detail = '') { super(detail ? `${code}: ${detail}` : code); this.code = code; }
}
export function check(condition, code, detail) {
  if (!condition) throw new CertificationError(code, detail);
}
export function canonical(value) {
  if (value === null || typeof value !== 'object') {
    check(value !== undefined && (typeof value !== 'number' || Number.isFinite(value)), 'NON_JSON_VALUE');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export function sha256(raw) { return createHash('sha256').update(raw).digest('hex'); }
export function objectHash(value) { return sha256(canonical(value)); }
export function json(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw;
  check(typeof text === 'string' && !text.includes('\ufffd'), 'INVALID_UTF8_JSON');
  // JSON.parse otherwise silently accepts duplicate object keys. Scan its validated token stream.
  const value = JSON.parse(text);
  const tokens = text.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g) ?? [];
  let i = 0;
  function walk() {
    const token = tokens[i++];
    if (token === '{') {
      const keys = new Set();
      while (tokens[i] !== '}') {
        const key = JSON.parse(tokens[i++]);
        check(!keys.has(key) && !['__proto__', 'constructor', 'prototype'].includes(key), 'DUPLICATE_OR_UNSAFE_JSON_KEY');
        keys.add(key); i++; walk();
        if (tokens[i] === ',') i++;
      }
      i++;
    } else if (token === '[') {
      while (tokens[i] !== ']') { walk(); if (tokens[i] === ',') i++; }
      i++;
    }
  }
  walk();
  return value;
}
export function instant(value) {
  check(typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value), 'EXPLICIT_TIMEZONE_REQUIRED');
  let result = Date.parse(value);
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1];
  // Round receipt/publication times up to the engine's millisecond resolution.
  if (fraction?.length > 3 && /[1-9]/.test(fraction.slice(3))) result++;
  check(Number.isSafeInteger(result), 'INVALID_TIMESTAMP');
  // Reject JS Date's silent conversion of impossible calendar dates.
  const date = value.slice(0, 10);
  check(new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date, 'INVALID_CALENDAR_DATE');
  return result;
}
export function minuteInstant(value) {
  const result = instant(value);
  check(/:00(?:\.0+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && result % 60000 === 0,
    'MISALIGNED_MINUTE');
  return result;
}
export function safeUrl(value) {
  check(typeof value === 'string' && value.length <= 2048, 'SOURCE_URL_REQUIRED');
  let url; try { url = new URL(value); } catch { throw new CertificationError('SOURCE_URL_REQUIRED'); }
  check(url.protocol === 'https:' && !url.username && !url.password && !url.hash
    && ![...url.searchParams.keys()].some(k => /token|secret|password|auth|session|api.?key/i.test(k)),
  'UNSAFE_SOURCE_URL');
  return value;
}
export function grid(session, length = 375) {
  check(NSE_SESSIONS.includes(session), 'OUTSIDE_SCOPED_SESSIONS');
  check(length === 375 || length === 15, 'UNSUPPORTED_GRID');
  return Array.from({ length }, (_, i) => sessionTime(session, 9, 15) + i * 60000);
}
export function csv(raw) {
  const text = (Buffer.isBuffer(raw) ? raw.toString('utf8') : raw).replace(/^\uFEFF/, '');
  check(!text.includes('\ufffd'), 'INVALID_UTF8_CSV');
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else { check(c !== undefined, 'UNTERMINATED_CSV_QUOTE'); field += c; }
    } else if (c === '"') {
      check(field === '' && !closed, 'INVALID_CSV_QUOTE'); quoted = true;
    } else if (c === ',' || c === '\n' || c === '\r' || c === undefined) {
      row.push(field); field = ''; closed = false;
      if (c !== ',') {
        if (!(row.length === 1 && row[0] === '')) rows.push(row);
        row = []; if (c === '\r' && text[i + 1] === '\n') i++;
      }
    } else { check(!closed, 'CSV_CONTENT_AFTER_QUOTE'); field += c; }
  }
  check(rows.length > 1 && new Set(rows[0]).size === rows[0].length
    && rows.every(r => r.length === rows[0].length), 'INVALID_CSV_SHAPE');
  return rows.slice(1).map(r => Object.fromEntries(rows[0].map((k, i) => [k, r[i]])));
}
function number(value, label, fromString = false) {
  if (fromString) {
    check(typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value), 'INVALID_NUMERIC_TEXT', label);
    value = Number(value);
  }
  check(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12,
    'INVALID_NUMBER', label);
  return value;
}
export function normalizeCandles(raw, { format, session, instrumentId, symbol, volumeUnit, priceBasis, kind }) {
  check(typeof instrumentId === 'string' && instrumentId.length <= 80, 'INSTRUMENT_ID_REQUIRED');
  check(volumeUnit === 'SHARES' || instrumentId === 'NSE_INDEX|Nifty 50' && volumeUnit === 'INDEX', 'SHARE_VOLUME_REQUIRED');
  check(['RAW_UNADJUSTED', 'BACK_ADJUSTED', 'UNKNOWN'].includes(priceBasis), 'PRICE_BASIS_REQUIRED');
  let rows;
  if (format === 'UPSTOX_V3') {
    const payload = json(raw);
    check(payload.status === 'success' && Array.isArray(payload.data?.candles), 'PROVIDER_ERROR_OR_WRONG_SCHEMA');
    rows = payload.data.candles.map(r => {
      check(Array.isArray(r) && r.length === 7, 'UPSTOX_CANDLE_SHAPE');
      return { time: minuteInstant(r[0]), open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] };
    });
  } else if (format === 'FYERS_V3') {
    const payload = json(raw);
    check(payload.s === 'ok' && Array.isArray(payload.candles), 'PROVIDER_ERROR_OR_WRONG_SCHEMA');
    rows = payload.candles.map(r => {
      check(Array.isArray(r) && (r.length === 6 || r.length === 7)
        && Number.isSafeInteger(r[0]) && r[0] > 1e9 && r[0] < 1e10, 'FYERS_EPOCH_SECONDS_REQUIRED');
      return { time: r[0] * 1000, open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] };
    });
  } else if (format === 'ATLAS_CSV') {
    rows = csv(raw).map(r => {
      check(Object.keys(r).join(',') === 'symbol,timestamp,open,high,low,close,volume' && r.symbol === symbol,
        'CSV_INSTRUMENT_OR_HEADER_MISMATCH');
      return { time: minuteInstant(r.timestamp), ...Object.fromEntries(['open', 'high', 'low', 'close', 'volume']
        .map(k => [k, number(r[k], k, true)])) };
    });
  } else if (format === 'NORMALIZED_V1') {
    const payload = json(raw);
    check(payload.schema === 'atlas.nse-candles.v1' && payload.instrumentId === instrumentId
      && payload.session === session && payload.kind === kind && Array.isArray(payload.rows), 'NORMALIZED_IDENTITY_MISMATCH');
    rows = payload.rows.map(r => ({ ...r, time: minuteInstant(r.time) }));
  } else throw new CertificationError('UNSUPPORTED_CANDLE_FORMAT');
  check(rows.length > 0 && rows.length <= 50000, 'EMPTY_OR_OVERSIZED_CANDLES');
  const start = sessionTime(session, 9, 15), end = sessionTime(session, 15, 30), seen = new Set();
  rows = rows.map(row => {
    check(Number.isSafeInteger(row.time) && row.time % 60000 === 0, 'MISALIGNED_MINUTE');
    check(row.time >= start && row.time < end, 'CANDLE_OUTSIDE_SESSION');
    check(!seen.has(row.time), 'DUPLICATE_MINUTE'); seen.add(row.time);
    const result = { time: row.time };
    for (const k of ['open', 'high', 'low', 'close', 'volume']) result[k] = number(row[k], k);
    check(['open', 'high', 'low', 'close'].every(k => result[k] > 0), 'NONPOSITIVE_PRICE');
    check(Number.isSafeInteger(result.volume), 'WHOLE_SHARE_VOLUME_REQUIRED');
    check(result.low <= Math.min(result.open, result.close)
      && result.high >= Math.max(result.open, result.close) && result.low <= result.high, 'INCONSISTENT_OHLC');
    return result;
  }).sort((a, b) => a.time - b.time);
  return { instrumentId, symbol, session, volumeUnit, priceBasis, rawSha256: sha256(raw), rows };
}
export function coverage(dataset, required = grid(dataset.session)) {
  const have = new Set(dataset.rows.map(r => r.time));
  const missing = required.filter(t => !have.has(t));
  return { expected: required.length, observed: required.length - missing.length,
    missing: missing.map(t => new Date(t).toISOString()), complete: missing.length === 0 };
}
export function normalizeUpstoxMaster(raw, { session, publishedAt, retrievedAt, eligibilityIds,
  suspendedIds = [], seriesByIsin, tickSizeUnit }) {
  // Current BOD files cannot be relabelled as historical snapshots.
  check(instant(publishedAt) < sessionTime(session, 9, 15)
    && instant(retrievedAt) >= instant(publishedAt), 'MASTER_NOT_PREOPEN');
  check(['PAISE', 'INR'].includes(tickSizeUnit), 'EXPLICIT_TICK_SIZE_UNIT_REQUIRED');
  const bytes = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw, { maxOutputLength: 32 * 1024 * 1024 }) : raw;
  const rows = json(bytes);
  check(Array.isArray(rows) && Array.isArray(eligibilityIds) && eligibilityIds.length >= 10, 'FULL_MIS_SNAPSHOT_REQUIRED');
  const wanted = new Set(eligibilityIds), suspended = new Set(suspendedIds);
  check(wanted.size === eligibilityIds.length && suspended.size === suspendedIds.length, 'DUPLICATE_ELIGIBILITY_ID');
  const byId = new Map();
  for (const r of rows) {
    check(typeof r.instrument_key === 'string' && !byId.has(r.instrument_key), 'DUPLICATE_MASTER_ID');
    byId.set(r.instrument_key, r);
  }
  const members = [...wanted].filter(id => !suspended.has(id)).map(id => {
    const r = byId.get(id);
    check(r?.segment === 'NSE_EQ' && r.instrument_type === 'EQ' && r.security_type === 'NORMAL'
      && seriesByIsin?.[r.isin] === 'EQ'
      && /^INE[A-Z0-9]{9}$/.test(r.isin) && id === `NSE_EQ|${r.isin}` && r.lot_size === 1,
    'NON_EQUITY_OR_UNRESOLVED_ELIGIBLE_ID', id);
    check(typeof r.trading_symbol === 'string' && /^[A-Z0-9&_.-]{1,50}$/.test(r.trading_symbol)
      && typeof r.tick_size === 'number' && r.tick_size > 0, 'INVALID_MASTER_METADATA');
    // A sample numeric tick_size alone does not establish its currency unit.
    return { id, symbol: r.trading_symbol, isin: r.isin, series: 'EQ', lotSize: 1,
      priceTickINR: r.tick_size / (tickSizeUnit === 'PAISE' ? 100 : 1), knownAt: publishedAt, effectiveFrom: session + 'T00:00:00+05:30',
      effectiveTo: session + 'T23:59:59+05:30', shortEligible: false };
  });
  check(new Set(members.map(r => r.symbol)).size === members.length, 'DUPLICATE_TRADING_SYMBOL');
  return members.sort((a, b) => a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0);
}
