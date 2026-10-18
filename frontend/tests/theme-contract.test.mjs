import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const chart = readFileSync(new URL('../src/components/HistoricalEquityChart.tsx', import.meta.url), 'utf8');

test('light theme is the default for first-time visitors', () => {
  assert.match(html, /data-theme="light"/);
  assert.match(app, /return 'light';/);
  assert.match(css, /html\[data-theme="light"\]/);
});
test('toggle is accessible, persistent, and cannot affect execution authority', () => {
  assert.match(app, /aria-label=\{theme === 'light'/);
  assert.match(app, /aria-pressed=\{theme === 'dark'\}/);
  assert.match(app, /window\.localStorage\.setItem\(THEME_KEY, theme\)/);
  assert.match(app, /window\.localStorage\.getItem\(THEME_KEY\)/);
  assert.match(app, /document\.documentElement\.dataset\.theme = theme/);
  assert.doesNotMatch(app, /toggleLiveTrading|enableLiveMode/);
});
test('all major screen surfaces and chart support the light palette', () => {
  for (const selector of ['.sidebar', '.topbar', '.panel', '.risk-hero', '.markets-safety',
    '.closed-candle-card', '.notice-popover', '.secondary-button']) {
    assert.ok(css.includes('html[data-theme="light"] ' + selector), selector);
  }
  assert.match(chart, /const light = document\.documentElement\.dataset\.theme !== 'dark'/);
});
