import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../../research/advanced/core.mjs';
import { simulate } from '../../research/advanced/simulation.mjs';
import { createResearchEnvelope, assertResearchEnvelope } from '../../research/advanced/contracts.mjs';
import { runCli } from '../../research/advanced/cli.mjs';
import { makeDataset } from './fixtures.mjs';
test('dashboard envelope preserves five strategy names and prevents fixture-to-live relabeling', () => {
  const result = createResearchEnvelope({ dataset: makeDataset() });
  assert.equal(result.strategies.length, 5);
  assert.equal(result.mode, 'SYNTHETIC_FIXTURE_REPLAY');
  assert.equal(result.paperLedgerImportAllowed, false);
  assertResearchEnvelope(result);
  const altered = structuredClone(result); altered.fixtureOnly = false;
  assert.throws(() => assertResearchEnvelope(altered), { code: 'FIXTURE_CLASSIFICATION_MISMATCH' });
});
test('self-checksummed fabricated performance is rejected by independent replay', () => {
  const dataset = makeDataset(), result = structuredClone(simulate({ dataset, strategyId: 'sma_9_21' }));
  result.endingEquityINR += 100000;
  const { resultHash, ...body } = result; result.resultHash = digest(body);
  assert.throws(() => createResearchEnvelope({ dataset, results: [result] }), { code: 'RESULT_REPLAY_MISMATCH' });
});
test('third-party export requires explicit source display rights', () => {
  const dataset = makeDataset(); dataset.provenance.displayToThirdPartiesAllowed = false;
  assert.throws(() => createResearchEnvelope({ dataset, audience: 'THIRD_PARTY' }),
    { code: 'THIRD_PARTY_DISPLAY_RIGHTS_UNVERIFIED' });
});
test('offline CLI exposes verified calendar and rejects missing input without fixture fallback', async () => {
  assert.equal(JSON.parse(await runCli(['calendar'])).count, 20);
  await assert.rejects(() => runCli(['replay']), { code: 'INPUT_PATH_REQUIRED' });
  await assert.rejects(() => runCli(['real-orders']), { code: 'UNKNOWN_RESEARCH_COMMAND' });
});
