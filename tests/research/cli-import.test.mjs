import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { rawDigest } from '../../research/advanced/core.mjs';
import { assertResearchEnvelope } from '../../research/advanced/contracts.mjs';
import { makeDataset } from './fixtures.mjs';
function cli(args) {
  return spawnSync(process.execPath, ['research/advanced/cli.mjs', ...args], {
    encoding: 'utf8', timeout: 15000,
    env: { PATH: process.env.PATH ?? '', LANG: 'C.UTF-8', TZ: 'UTC' },
  });
}
test('full CLI imports exact bytes and writes a replay-verified fixture envelope', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-advanced-import-'));
  try {
    const dataset = makeDataset({ count: 80 }), raw = JSON.stringify(dataset.candles);
    const { candles, ...manifest } = dataset; manifest.provenance.rawSha256 = rawDigest(raw);
    const manifestPath = join(directory, 'manifest.json'), candlePath = join(directory, 'candles.json');
    const outputPath = join(directory, 'research.json');
    await writeFile(manifestPath, JSON.stringify(manifest)); await writeFile(candlePath, raw);
    const args = ['replay', '--manifest', manifestPath, '--candles', candlePath, '--output', outputPath];
    const completed = cli(args);
    assert.equal(completed.status, 0, completed.stderr);
    const result = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(result.importReceipt.payloadSha256, rawDigest(raw));
    assertResearchEnvelope(result.research);
    assert.equal(result.research.fixtureOnly, true);
    const second = cli(args);
    assert.equal(second.status, 2);
    assert.equal(JSON.parse(second.stderr).error, 'EEXIST');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('CLI cannot replace tampered bytes with a synthetic fallback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-advanced-reject-'));
  try {
    const dataset = makeDataset({ count: 30 }), raw = JSON.stringify(dataset.candles);
    const { candles, ...manifest } = dataset; manifest.provenance.rawSha256 = rawDigest(raw);
    const manifestPath = join(directory, 'manifest.json'), candlePath = join(directory, 'candles.json');
    await writeFile(manifestPath, JSON.stringify(manifest)); await writeFile(candlePath, raw + ' ');
    const completed = cli(['replay', '--manifest', manifestPath, '--candles', candlePath]);
    assert.equal(completed.status, 2);
    assert.equal(completed.stdout, '');
    assert.equal(JSON.parse(completed.stderr).error, 'RAW_PAYLOAD_HASH_MISMATCH');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
