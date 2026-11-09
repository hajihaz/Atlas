import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writePaperSnapshotAtomic } from '../../scripts/paper_atomic_store.mjs';

test('scheduled paper snapshot replacement is atomic and cleans up a failed candidate', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-paper-atomic-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'cloud-paper.json');
  await writeFile(file, '{"runCount":17}\n');
  const failing = { ...fs, rename: async () => { throw Error('simulated rename failure'); } };
  await assert.rejects(writePaperSnapshotAtomic(file, '{"runCount":18}\n', failing),
    /simulated rename failure/);
  assert.equal(await readFile(file, 'utf8'), '{"runCount":17}\n');
  assert.deepEqual(await readdir(dir), ['cloud-paper.json']);

  await writePaperSnapshotAtomic(file, '{"runCount":18}\n');
  assert.equal(await readFile(file, 'utf8'), '{"runCount":18}\n');
  assert.deepEqual(await readdir(dir), ['cloud-paper.json']);
  await assert.rejects(writePaperSnapshotAtomic(path.join(dir, 'real-orders.json'), '{}'));
});
