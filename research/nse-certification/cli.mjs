#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBundle, auditCampaign } from './certify.mjs';
import { replayCertified } from './replay.mjs';
import { check } from './normalize.mjs';

function cell(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function table(rows, fields) {
  return fields.join(',') + '\n' + rows.map(row => fields.map(k => cell(row[k])).join(',')).join('\n') + '\n';
}
export function writeReports(report, directory) {
  const target = resolve(directory);
  check(!existsSync(target), 'OUTPUT_DIRECTORY_EXISTS');
  mkdirSync(target, { recursive: true });
  const daily = report.daily.map(d => ({ ...d, valueStatus: d.netPnlINR === null ? 'UNVERIFIED' : 'MODELED',
    blockerCodes: d.blockers.map(b => b.code).join('|') }));
  const trades = report.daily.flatMap(d => d.trades === null
    ? [{ session: d.session, valueStatus: 'UNVERIFIED' }]
    : d.trades.length ? d.trades.map(t => ({ session: d.session, valueStatus: 'HYPOTHETICAL', ...t }))
      : [{ session: d.session, valueStatus: 'VERIFIED_NO_TRADE' }]);
  const files = {
    'report.json': JSON.stringify(report, null, 2) + '\n',
    'daily.csv': table(daily, ['session', 'status', 'valueStatus', 'certified', 'eligibleStockCount',
      'selected', 'realizedPnlINR', 'unrealizedPnlINR', 'feesINR', 'netPnlINR', 'returnPct', 'maxDrawdownPct', 'endingEquityINR', 'blockerCodes']),
    'monthly.csv': table(report.months.map(m => ({ ...m, valueStatus: m.netPnlINR === null ? 'UNVERIFIED' : 'MODELED' })),
      ['month', 'valueStatus', 'expectedSessions', 'certifiedSessions', 'trades', 'realizedPnlINR',
        'unrealizedPnlINR', 'feesINR', 'netPnlINR', 'returnPct', 'maxDrawdownPct', 'frequentlySelectedStocks']),
    'trades.csv': table(trades, ['session', 'valueStatus', 'symbol', 'side', 'time', 'quantity', 'priceINR', 'feeINR', 'grossPnlINR', 'reason']),
  };
  for (const [name, content] of Object.entries(files)) writeFileSync(join(target, name), content, { flag: 'wx', mode: 0o600 });
  return Object.keys(files);
}
export function main(args) {
  const [command, ...rest] = args;
  check(['audit', 'replay'].includes(command) && rest.length % 2 === 0, 'USAGE_AUDIT_OR_REPLAY_WITH_EXPLICIT_INPUT');
  const allowed = new Set(['--root', '--manifest', '--out', '--review', '--review-sha256']);
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    check(allowed.has(rest[i]) && !Object.hasOwn(options, rest[i]) && rest[i + 1], 'INVALID_OR_DUPLICATE_ARGUMENT');
    options[rest[i]] = rest[i + 1];
  }
  check(options['--root'] && options['--manifest'] && options['--out'], 'EXPLICIT_INPUT_AND_OUTPUT_REQUIRED');
  check(Boolean(options['--review']) === Boolean(options['--review-sha256']), 'REVIEW_AND_HASH_REQUIRED_TOGETHER');
  const bundle = openBundle(options['--root'], options['--manifest']);
  const review = options['--review'] ? { reviewRaw: readFileSync(options['--review']),
    expectedReviewSha256: options['--review-sha256'] } : {};
  const report = command === 'replay' ? replayCertified(bundle, review) : auditCampaign(bundle, review).report;
  writeReports(report, options['--out']);
  process.stdout.write(JSON.stringify({ realSessionsCertified: report.realSessionsCertified,
    expectedSessions: 20, historicalNetPnlINR: report.historicalNetPnlINR, reportHash: report.reportHash }) + '\n');
  return report.realSessionsCertified === 20 && (command === 'audit' || report.historicalNetPnlINR !== null) ? 0 : 3;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { process.stderr.write((error.code ?? 'INVALID_INPUT') + ': ' + error.message + '\n'); process.exitCode = 2; }
}
