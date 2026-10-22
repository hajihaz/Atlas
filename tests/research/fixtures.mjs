// Every price and symbol in this file is an explicitly artificial test fixture.
import { digest } from '../../research/advanced/core.mjs';
export const T0 = Date.parse('2026-09-18T00:00:00Z');
export const MINUTE = 60000;
export function fixtureProvenance(payload, retrievedAt) {
  return { kind: 'SYNTHETIC_FIXTURE', provider: 'Atlas artificial test generator',
    sourceUrl: 'fixture://atlas/advanced-tests', retrievedAt, rawSha256: digest(payload),
    researchUseAllowed: true, displayToThirdPartiesAllowed: true,
    licenseRef: 'Original Atlas test fixture; not market evidence', availabilityMode: 'ASSUMED_BAR_CLOSE' };
}
export function makeDataset({ closes, opens, volumes, count = 240, start = T0,
  id = 'FIXTURE_COIN', assetClass = 'CRYPTO', intervalMs = MINUTE } = {}) {
  const values = closes ?? Array.from({ length: count }, (_, i) => 100 + 10 * Math.sin(i / 8) + i / 50);
  const candles = values.map((close, i) => {
    const open = opens?.[i] ?? (i ? values[i - 1] : close);
    return { time: start + i * intervalMs, availableAt: start + (i + 1) * intervalMs,
      open, close, high: Math.max(open, close) + 0.1, low: Math.min(open, close) - 0.1,
      volume: volumes?.[i] ?? 100000 };
  });
  const retrievedAt = start + (values.length + 2) * intervalMs;
  return { schema: 'atlas.market.v1', instrument: { id, assetClass,
    venue: assetClass === 'CRYPTO' ? 'FIXTURE_CRYPTO' : 'NSE', currency: 'INR',
    lotSize: assetClass === 'CRYPTO' ? 0.001 : 1, priceTick: 0.01 },
    intervalMs, candles, provenance: fixtureProvenance(candles, retrievedAt),
    ...(assetClass !== 'CRYPTO' ? {
      expectedTimes: candles.map(row => row.time),
      corporateActions: { reviewed: true, reviewedThrough: retrievedAt,
        sourceUrl: 'fixture://atlas/actions', actions: [] },
    } : {}) };
}
export const clone = value => structuredClone(value);
export const noCosts = { initialCapitalINR: 1000, feeBps: 0, slippageBps: 0,
  stopLossFraction: null, maxDrawdownFraction: 1, maxParticipation: 1 };
