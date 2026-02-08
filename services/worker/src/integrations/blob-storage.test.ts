import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

describe('worker:blob-storage', () => {
  it('reads and quarantines blobs by hash path', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'regintel-blobs-'));
    process.env.BLOB_STORAGE_PATH = baseDir;
    process.env.STORAGE_DRIVER = 'filesystem';

    const { getBlobPath, readBlob, quarantineBlob } = await import('./blob-storage');

    const content = Buffer.from('test-blob-content');
    const hash = createHash('sha256').update(content).digest('hex');
    const contentHash = `sha256:${hash}`;

    const path = getBlobPath(contentHash);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);

    const read = await readBlob(contentHash);
    expect(read?.toString('utf-8')).toBe('test-blob-content');

    await quarantineBlob(contentHash);
    const after = await readBlob(contentHash);
    expect(after).toBeNull();

    await rm(baseDir, { recursive: true, force: true });
  });
});
