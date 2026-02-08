import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { promises as fs } from 'node:fs';
import type { BlobMetadata, MalwareScanStatus, StorageProvider } from './types';
import { StorageNotFoundError } from './errors';

/**
 * Filesystem-based blob storage implementation.
 *
 * Stores blobs in sharded directories based on hash prefix:
 * /var/regintel/evidence-blobs/ab/cd/abcdef123...
 */
export class FilesystemBlobStorage implements StorageProvider {
  private readonly basePath: string;
  private readonly quarantinePath: string;

  constructor(basePath: string = '/var/regintel/evidence-blobs') {
    this.basePath = basePath;
    this.quarantinePath = join(basePath, '.quarantine');
  }

  async upload(content: Buffer, contentType: string): Promise<BlobMetadata> {
    const hashHex = createHash('sha256').update(content).digest('hex');
    const contentHash = `sha256:${hashHex}`;

    const storagePath = this.getStoragePath(contentHash);
    if (await this.exists(contentHash)) {
      const stats = await fs.stat(storagePath);
      return {
        contentHash,
        contentType,
        sizeBytes: stats.size,
        uploadedAt: stats.birthtime.toISOString(),
        storagePath,
      };
    }

    const dir = dirname(storagePath);
    await fs.mkdir(dir, { recursive: true });

    const tempPath = `${storagePath}.tmp`;
    await fs.writeFile(tempPath, content);
    await fs.rename(tempPath, storagePath);

    return {
      contentHash,
      contentType,
      sizeBytes: content.length,
      uploadedAt: new Date().toISOString(),
      storagePath,
    };
  }

  async download(contentHash: string): Promise<Buffer> {
    const storagePath = this.getStoragePath(contentHash);
    try {
      return await fs.readFile(storagePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageNotFoundError(contentHash);
      }
      throw error;
    }
  }

  async exists(contentHash: string): Promise<boolean> {
    const storagePath = this.getStoragePath(contentHash);
    try {
      await fs.access(storagePath);
      return true;
    } catch {
      return false;
    }
  }

  async quarantine(contentHash: string): Promise<void> {
    const storagePath = this.getStoragePath(contentHash);
    const hash = contentHash.replace('sha256:', '');
    const quarantinedPath = join(this.quarantinePath, hash);

    await fs.mkdir(this.quarantinePath, { recursive: true });

    try {
      await fs.rename(storagePath, quarantinedPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageNotFoundError(contentHash);
      }
      throw error;
    }
  }

  async scanForMalware(contentHash: string): Promise<MalwareScanStatus> {
    if (!(await this.exists(contentHash))) {
      throw new StorageNotFoundError(contentHash);
    }

    // Stub implementation - real scanning handled by worker.
    return 'CLEAN';
  }

  async delete(contentHash: string): Promise<void> {
    const storagePath = this.getStoragePath(contentHash);

    try {
      await fs.unlink(storagePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  /**
   * Resolve storage path for a content hash.
   * Uses 2-level sharding: /ab/cd/abcdef...
   */
  getStoragePath(contentHash: string): string {
    const hash = contentHash.replace('sha256:', '');
    const shard1 = hash.slice(0, 2);
    const shard2 = hash.slice(2, 4);

    return join(this.basePath, shard1, shard2, hash);
  }
}
