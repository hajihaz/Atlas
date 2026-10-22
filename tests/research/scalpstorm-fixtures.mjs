import { makeDataset, fixtureProvenance } from './fixtures.mjs';
import { minuteGrid, sessionTime } from '../../research/advanced/calendar.mjs';

export function makeScalpDay({ session = '2026-09-18', direction = 1, members = 12 } = {}) {
  const start = sessionTime(session, 9, 15), count = minuteGrid(session).length;
  const datasets = Array.from({ length: members }, (_, k) => makeDataset({
    id: 'FIXTURE_STOCK_' + String(k).padStart(2, '0'), assetClass: 'NSE_EQUITY', start,
    closes: Array.from({ length: count }, (_, i) => 100 + k + i * 0.002),
    volumes: Array(count).fill(10000 + (members - k) * 100),
  }));
  const universe = { schema: 'atlas.universe.v1', completeEligibleUniverse: true,
    knownAt: start - 60000, provenance: fixtureProvenance('artificial preopen universe', start - 1000),
    instruments: datasets.map(data => ({ id: data.instrument.id, availableAt: start - 60000,
      effectiveFrom: start - 86400000, effectiveTo: null, shortEligible: true })) };
  const indexDataset = makeDataset({ id: 'FIXTURE_NIFTY', assetClass: 'NSE_INDEX', start,
    closes: Array.from({ length: 15 }, (_, i) => 100 + direction * i * 0.02) });
  return { session, universe, datasets, indexDataset };
}
