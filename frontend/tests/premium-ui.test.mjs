import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.tsx');
const main = read('../src/main.tsx');
const premium = read('../src/premium.css');
const card = read('../src/components/PremiumStatCard.tsx');
const page = read('../src/components/ScalpStormDetailed.tsx');

test('visual treatment is scoped behind the existing atlas styles', () => {
  assert.ok(main.indexOf("import './styles.css';") < main.indexOf("import './premium.css';"));
  assert.match(premium, /html\[data-theme="light"\]/);
  assert.match(premium, /html\[data-theme="dark"\]/);
  assert.match(premium, /\.premium-hero/);
  assert.match(premium, /\.premium-stat-card/);
  assert.match(premium, /prefers-reduced-motion:reduce/);
});

test('all existing screens remain reachable after UI redesign', () => {
  for (const id of ['overview','markets','strategies','research','scalpstorm','risk','orders','audit']) {
    assert.match(app, new RegExp("id: '" + id + "'"));
  }
  assert.match(app, /<ScalpStormDetailed\/>/);
  assert.match(app, /<MarketsPage\/>/);
  assert.match(app, /<RiskPage\/>/);
  assert.match(app, /<OrdersPage\/>/);
  assert.match(app, /<AuditPage\/>/);
});

test('premium stat component uses actual archived evidence and never fabricates P&L', () => {
  assert.match(card, /series\?: readonly number\[\]/);
  assert.match(card, /values\.map/);
  assert.match(card, /Historical replay trend, not live portfolio performance/);
  assert.match(app, /series=\{all\.slice\(-20\)\.map\(point => point\.equity\)\}/);
  assert.match(app, /title="Archived replay equity"/);
  assert.match(app, /title="Capital authorization" value="BLOCKED"/);
  assert.match(card, /\{value\}/);
  assert.doesNotMatch(card, /\+2\.45%|\$250,000/);
});

test('risk caveats, user switches and ScalpStorm evidence are preserved', () => {
  assert.match(app, /window\.localStorage\.setItem\(THEME_KEY, theme\)/);
  assert.match(app, /aria-pressed=\{theme === 'dark'\}/);
  assert.match(app, /Live trading is disabled/);
  assert.match(app, /No live execution permissions/);
  assert.match(app, /Research mode/);
  assert.match(page, /Actual stocks, entries, exits, charges, wins and losses: NOT VERIFIED/);
  assert.match(page, /Net trading profit: UNAVAILABLE/);
});

test('hover effects never remove keyboard focus or reduced-motion support', () => {
  assert.match(premium, /@media\(hover:hover\)/);
  assert.match(premium, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(premium, /\.premium-stat-card:hover/);
  assert.match(premium, /animation:none!important/);
  assert.match(premium, /\.scx-ledger-table/);
  assert.match(premium, /@media\(max-width:565px\)/);
  assert.doesNotMatch(premium, /pointer-events:none[^}]*\.main-content/);
});
