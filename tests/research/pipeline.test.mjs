import test from 'node:test';
import assert from 'node:assert/strict';
import { rawDigest } from '../../research/advanced/core.mjs';
import { ingestCandleJson } from '../../research/advanced/pipeline.mjs';
import { makeDataset } from './fixtures.mjs';
test('import receipt binds actual raw bytes and normalized data', () => {
  const manifest = makeDataset({ count: 30 }), raw = JSON.stringify(manifest.candles);
  manifest.provenance.rawSha256 = rawDigest(raw);
  const { dataset, receipt } = ingestCandleJson(raw, manifest);
  assert.equal(receipt.payloadSha256, rawDigest(raw));
  assert.equal(receipt.normalizedHash, dataset.hash);
  assert.equal(receipt.externallyAudited, false);
});
test('altered raw payload cannot reuse a prior provenance receipt', () => {
  const manifest = makeDataset({ count: 30 }), raw = JSON.stringify(manifest.candles);
  manifest.provenance.rawSha256 = rawDigest(raw);
  assert.throws(() => ingestCandleJson(raw + ' ', manifest), { code: 'RAW_PAYLOAD_HASH_MISMATCH' });
});
