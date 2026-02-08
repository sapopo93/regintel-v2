import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { FilesystemBlobStorage } from './filesystem';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('FilesystemBlobStorage', () => {
  let storage: FilesystemBlobStorage;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `regintel-storage-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    storage = new FilesystemBlobStorage(testDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('uploads blob and returns metadata', async () => {
    const content = Buffer.from('test content');
    const result = await storage.upload(content, 'text/plain');

    expect(result.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.contentType).toBe('text/plain');
    expect(result.sizeBytes).toBe(content.length);
    expect(result.uploadedAt).toBeTruthy();
    expect(result.storagePath).toContain(testDir);
  });

  it('deduplicates identical content', async () => {
    const content = Buffer.from('identical content');

    const result1 = await storage.upload(content, 'text/plain');
    const result2 = await storage.upload(content, 'text/plain');

    expect(result1.contentHash).toBe(result2.contentHash);
    expect(result1.storagePath).toBe(result2.storagePath);
  });

  it('downloads blob by hash', async () => {
    const content = Buffer.from('downloadable content');
    const { contentHash } = await storage.upload(content, 'text/plain');

    const downloaded = await storage.download(contentHash);

    expect(downloaded.toString()).toBe(content.toString());
  });

  it('checks if blob exists', async () => {
    const content = Buffer.from('exists test');
    const { contentHash } = await storage.upload(content, 'text/plain');

    const exists = await storage.exists(contentHash);
    expect(exists).toBe(true);

    const notExists = await storage.exists('sha256:' + '0'.repeat(64));
    expect(notExists).toBe(false);
  });

  it('quarantines blob', async () => {
    const content = Buffer.from('quarantine test');
    const { contentHash } = await storage.upload(content, 'text/plain');

    expect(await storage.exists(contentHash)).toBe(true);

    await storage.quarantine(contentHash);

    expect(await storage.exists(contentHash)).toBe(false);

    const hash = contentHash.replace('sha256:', '');
    const quarantinedPath = join(testDir, '.quarantine', hash);
    const quarantineExists = await fs.access(quarantinedPath).then(() => true).catch(() => false);
    expect(quarantineExists).toBe(true);
  });

  it('deletes blob', async () => {
    const content = Buffer.from('delete test');
    const { contentHash } = await storage.upload(content, 'text/plain');

    expect(await storage.exists(contentHash)).toBe(true);

    await storage.delete(contentHash);

    expect(await storage.exists(contentHash)).toBe(false);
  });

  it('handles different content with different hashes', async () => {
    const content1 = Buffer.from('content A');
    const content2 = Buffer.from('content B');

    const result1 = await storage.upload(content1, 'text/plain');
    const result2 = await storage.upload(content2, 'text/plain');

    expect(result1.contentHash).not.toBe(result2.contentHash);
  });

  it('creates sharded directory structure', async () => {
    const content = Buffer.from('shard test');
    const { contentHash, storagePath } = await storage.upload(content, 'text/plain');

    const hash = contentHash.replace('sha256:', '');
    const shard1 = hash.slice(0, 2);
    const shard2 = hash.slice(2, 4);

    expect(storagePath).toContain(join(shard1, shard2));
  });

  it('scans for malware (stub returns CLEAN)', async () => {
    const content = Buffer.from('scan test');
    const { contentHash } = await storage.upload(content, 'text/plain');

    const scanResult = await storage.scanForMalware?.(contentHash);

    expect(scanResult).toBe('CLEAN');
  });
});
