// Explicit SYNTHETIC engineering certification, never a historical market backtest.
import { spawnSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { digest, rawDigest, requireThat } from './core.mjs';
import { STRATEGIES } from './strategies.mjs';
import { simulate } from './simulation.mjs';
import { walkForward, uncertainty, verifyPrefixInvariance } from './evaluation.mjs';
import { runScalpStormCampaign } from './scalpstorm.mjs';
import { createResearchEnvelope, assertResearchEnvelope } from './contracts.mjs';
import { makeDataset } from '../../tests/research/fixtures.mjs';
import { makeScalpDay } from '../../tests/research/scalpstorm-fixtures.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const tests = (await readdir(root + 'tests/research')).filter(name => name.endsWith('.test.mjs')).sort();
const completed = spawnSync(process.execPath, ['--test', '--test-reporter=tap',
  ...tests.map(name => 'tests/research/' + name)], { cwd: root, encoding: 'utf8', timeout: 60000,
  env: { PATH: process.env.PATH ?? '', LANG: 'C.UTF-8', TZ: 'UTC' }, maxBuffer: 4000000 });
requireThat(completed.status === 0 && /^# fail 0$/m.test(completed.stdout), 'RESEARCH_TEST_CERTIFICATION_FAILED',
  (completed.stdout + completed.stderr).slice(-3000));
const count = Number(completed.stdout.match(/^# tests (\d+)$/m)?.[1]);
requireThat(Number.isInteger(count) && count > 0, 'MISSING_TEST_COUNT');
const dataset = makeDataset();
const results = STRATEGIES.map(({ id }) => simulate({ dataset, strategyId: id }));
const envelope = createResearchEnvelope({ dataset, results });
assertResearchEnvelope(envelope);
const fold = walkForward({ dataset, strategyId: 'sma_9_21',
  parameterGrid: [{ fast: 3, slow: 8 }, { fast: 5, slow: 12 }], trainBars: 80, testBars: 40 });
const campaign = runScalpStormCampaign({ days: [makeScalpDay()] });
const sourceHashes = {};
for (const name of (await readdir(root + 'research/advanced')).filter(name => /\.(mjs|py)$/.test(name)).sort())
  sourceHashes[name] = rawDigest(await readFile(root + 'research/advanced/' + name));
const deterministicEvidence = {
  strategyResults: results.map(result => ({ id: result.strategy.id, resultHash: result.resultHash,
    prefixInvariant: verifyPrefixInvariance({ dataset, strategyId: result.strategy.id }, 120).passed,
    uncertainty: uncertainty(result) })),
  walkForwardResultHash: fold.resultHash, folds: fold.folds.length,
  envelopeHash: envelope.envelopeHash, fixtureCampaignHash: digest(campaign),
  missingAuthenticCampaign: runScalpStormCampaign(),
};
const report = { schema: 'atlas.quant-engineering-certification.v1', checkedAt: new Date().toISOString(),
  scope: 'OFFLINE_ENGINEERING_BEHAVIOR_ON_EXPLICIT_ARTIFICIAL_FIXTURES',
  nodeVersion: process.version, tests: { command: 'node --test tests/research/*.test.mjs',
    passed: count, failed: 0, skipped: 0 }, sourceHashes, deterministicEvidence,
  deterministicEvidenceHash: digest(deterministicEvidence),
  historicalPerformanceCertified: false, strategyProfitabilityCertified: false,
  additionalPackagesInstalled: 0, realOrdersEnabled: false, productionDeploymentPerformed: false };
await writeFile(root + 'docs/research/advanced/certification.json', JSON.stringify(report, null, 2) + '\n');
await writeFile(root + 'docs/research/advanced/fixture-dashboard-envelope.json', JSON.stringify(envelope, null, 2) + '\n');
console.log(JSON.stringify({ passed: count, failed: 0, deterministicEvidenceHash: report.deterministicEvidenceHash,
  historicalPerformanceCertified: false, realOrdersEnabled: false }));
