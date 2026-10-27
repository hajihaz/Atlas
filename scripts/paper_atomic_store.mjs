// Persist a validated public virtual-paper snapshot without exposing readers
// to a truncated JSON file if the scheduled runner stops during a write.
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export async function writePaperSnapshotAtomic(file, data, storage = fs) {
  if (typeof file !== 'string' || !file.endsWith('/cloud-paper.json') ||
      typeof data !== 'string' || data.length === 0) {
    throw Error('Unsafe virtual-paper persistence target');
  }
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  try {
    const handle = await storage.open(temporary, 'wx', 0o644);
    try {
      await handle.writeFile(data, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await storage.rename(temporary, file);
  } catch (error) {
    await storage.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
