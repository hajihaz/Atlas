import { requireThat, finite, cents, round, freeze } from './core.mjs';

export const DEFAULT_CONFIG = freeze({
  initialCapitalINR: 100000, feeBps: 10, sellFeeBps: 10, fixedFeeINR: 0,
  minimumFeeINR: 0, slippageBps: 5, maxParticipation: 0.05,
  maxExposure: 1, stopLossFraction: 0.02, maxDrawdownFraction: 0.10,
});
export function executionConfig(input = {}) {
  requireThat(input && Object.getPrototypeOf(input) === Object.prototype
    && Object.keys(input).every(key => Object.hasOwn(DEFAULT_CONFIG, key)), 'UNKNOWN_EXECUTION_PARAMETER');
  const config = { ...DEFAULT_CONFIG, ...input };
  if (Object.hasOwn(input, 'feeBps') && !Object.hasOwn(input, 'sellFeeBps'))
    config.sellFeeBps = input.feeBps;
  finite(config.initialCapitalINR, 'initialCapitalINR', { min: 0.01, max: 1e10 });
  for (const name of ['feeBps', 'sellFeeBps', 'slippageBps'])
    finite(config[name], name, { min: 0, max: 1000 });
  for (const name of ['fixedFeeINR', 'minimumFeeINR'])
    finite(config[name], name, { min: 0, max: 1e6 });
  finite(config.maxParticipation, 'maxParticipation', { min: Number.MIN_VALUE, max: 1 });
  finite(config.maxExposure, 'maxExposure', { min: Number.MIN_VALUE, max: 1 });
  finite(config.maxDrawdownFraction, 'maxDrawdownFraction', { min: Number.MIN_VALUE, max: 1 });
  if (config.stopLossFraction !== null)
    finite(config.stopLossFraction, 'stopLossFraction', { min: Number.MIN_VALUE, max: 0.99 });
  cents(config.initialCapitalINR);
  return freeze(config);
}
export function executionPrice(reference, side, config, tick) {
  finite(reference, 'reference price', { min: Number.MIN_VALUE });
  requireThat(side === 'BUY' || side === 'SELL', 'INVALID_SIDE');
  const adverse = reference * (1 + (side === 'BUY' ? 1 : -1) * config.slippageBps / 10000);
  const ticks = side === 'BUY' ? Math.ceil(adverse / tick - 1e-9) : Math.floor(adverse / tick + 1e-9);
  const price = round(ticks * tick, 12);
  requireThat(price > 0, 'NONPOSITIVE_FILL_PRICE');
  return price;
}
export function notionalCents(quantity, price, side) {
  return cents(quantity * price, side === 'BUY' ? 'up' : 'down');
}
export function feeCents(notional, side, config) {
  const bps = side === 'BUY' ? config.feeBps : config.sellFeeBps;
  return Math.max(cents(config.minimumFeeINR, 'up'),
    cents(notional / 100 * bps / 10000 + config.fixedFeeINR, 'up'));
}
export function liquidityLots(knownVolume, lotSize, participation) {
  finite(knownVolume, 'lagged volume', { min: 0 });
  const lots = Math.floor(knownVolume * participation / lotSize + 1e-9);
  requireThat(Number.isSafeInteger(lots) && lots >= 0, 'QUANTITY_OVERFLOW');
  return lots;
}
export function affordableLots(budget, price, lotSize, maxLots, config, side = 'BUY') {
  let low = 0, high = Math.min(maxLots, Math.floor(budget / (price * lotSize * 100)));
  requireThat(Number.isSafeInteger(high), 'QUANTITY_OVERFLOW');
  while (low < high) {
    const middle = low + Math.ceil((high - low) / 2);
    const notional = notionalCents(middle * lotSize, price, side);
    if (notional + feeCents(notional, side, config) <= budget) low = middle;
    else high = middle - 1;
  }
  return low;
}
