import { requireThat, integer, finite, freeze, digest } from './core.mjs';

export const STRATEGIES = freeze([
  { id: 'sma_9_21', name: 'SMA 9/21 Crossover', defaults: { fast: 9, slow: 21 } },
  { id: 'ema_12_26', name: 'EMA 12/26 Momentum', defaults: { fast: 12, slow: 26 } },
  { id: 'rsi_14', name: 'RSI 14 Mean Reversion', defaults: { period: 14, entry: 30, exit: 60 } },
  { id: 'breakout_20', name: '20-Bar Breakout', defaults: { entryBars: 20, exitBars: 10 } },
  { id: 'sps_pullback', name: 'SPS Swing Pullback', defaults: { fast: 5, slow: 20 } },
]);
export function strategySpec(id, parameters = {}) {
  const definition = STRATEGIES.find(row => row.id === id);
  requireThat(definition, 'UNKNOWN_STRATEGY');
  requireThat(parameters && Object.getPrototypeOf(parameters) === Object.prototype
    && Object.keys(parameters).every(key => Object.hasOwn(definition.defaults, key)), 'UNKNOWN_PARAMETER');
  const params = { ...definition.defaults, ...parameters };
  for (const [key, value] of Object.entries(params)) {
    if (key === 'entry' || key === 'exit') finite(value, key, { min: 0, max: 100 });
    else integer(value, key, { min: 2, max: 500 });
  }
  if (params.fast !== undefined) requireThat(params.fast < params.slow, 'INVALID_WINDOW_ORDER');
  if (params.period) requireThat(params.entry < params.exit, 'INVALID_RSI_THRESHOLDS');
  if (params.entryBars) requireThat(params.exitBars <= params.entryBars, 'INVALID_BREAKOUT_WINDOWS');
  const warmup = params.slow ? params.slow + 1
    : params.period ? params.period + 2 : params.entryBars + 1;
  const spec = { id, name: definition.name, version: 'advanced.1', parameters: params, warmup,
    semantics: 'Long-only closed-prefix signals; simple rolling RSI matches existing Atlas v1' };
  return freeze({ ...spec, hash: digest(spec) });
}
export function sma(values, count) {
  return values.length < count ? null : values.slice(-count).reduce((sum, n) => sum + n, 0) / count;
}
export function ema(values, count) {
  if (values.length < count) return null;
  let value = sma(values.slice(0, count), count);
  const alpha = 2 / (count + 1);
  for (let i = count; i < values.length; i++) value = values[i] * alpha + value * (1 - alpha);
  return value;
}
export function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    if (delta > 0) gains += delta; else losses -= delta;
  }
  return losses === 0 ? gains === 0 ? 50 : 100 : 100 - 100 / (1 + gains / losses);
}
export function evaluateStrategy(spec, history) {
  requireThat(Array.isArray(history), 'INVALID_STRATEGY_HISTORY');
  if (history.length < spec.warmup)
    return freeze({ action: 'HOLD', reason: 'WARMUP', strategyId: spec.id, strategyHash: spec.hash });
  const values = history.map(row => finite(row.close, 'strategy close', { min: Number.MIN_VALUE }));
  const previous = values.slice(0, -1), last = values.at(-1), before = values.at(-2), p = spec.parameters;
  let buy = false, sell = false, evidence = {};
  if (spec.id === 'sma_9_21' || spec.id === 'ema_12_26') {
    const average = spec.id === 'ema_12_26' ? ema : sma;
    const fast = average(values, p.fast), slow = average(values, p.slow);
    const previousFast = average(previous, p.fast), previousSlow = average(previous, p.slow);
    buy = previousFast <= previousSlow && fast > slow;
    sell = previousFast >= previousSlow && fast < slow;
    evidence = { fast, slow, previousFast, previousSlow };
  } else if (spec.id === 'rsi_14') {
    const current = rsi(values, p.period), prior = rsi(previous, p.period);
    buy = prior <= p.entry && current > p.entry; sell = current >= p.exit;
    evidence = { rsi: current, previousRsi: prior };
  } else if (spec.id === 'breakout_20') {
    const ceiling = Math.max(...previous.slice(-p.entryBars));
    const floor = Math.min(...previous.slice(-p.exitBars));
    buy = last > ceiling; sell = last < floor; evidence = { ceiling, floor };
  } else if (spec.id === 'sps_pullback') {
    const slow = sma(values, p.slow), previousSlow = sma(previous, p.slow);
    const fast = sma(values, p.fast), previousFast = sma(previous, p.fast);
    buy = slow > previousSlow && before <= previousFast && last > fast && last > slow;
    sell = last < slow; evidence = { slow, previousSlow, fast, previousFast };
  } else requireThat(false, 'UNKNOWN_STRATEGY');
  return freeze({ action: buy ? 'BUY' : sell ? 'SELL' : 'HOLD',
    reason: buy ? 'ENTRY_RULE' : sell ? 'EXIT_RULE' : 'NO_CROSS',
    signalBarTime: history.at(-1).time, availableAt: history.at(-1).availableAt,
    strategyId: spec.id, strategyHash: spec.hash, evidence });
}
