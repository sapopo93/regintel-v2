/**
 * Blob Storage Backend
 *
 * Provides content-addressed storage for evidence blobs with:
 * - Automatic deduplication (same content = same hash)
 * - Malware scanning integration
 * - Quarantine for suspicious files
 */

import { createWriteStream, promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export interface BlobMetadata {
  contentHash: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  storagePath: string;
}

export interface BlobStorageBackend {
  /**
   * Upload blob content. Returns existing metadata if blob already exists (deduplication).
   */
  upload(content: Buffer, contentType: string): Promise<BlobMetadata>;

  /**
   * Download blob content by hash
   */
  download(contentHash: string): Promise<Buffer>;

  /**
   * Check if blob exists
   */
  exists(contentHash: string): Promise<boolean>;

  /**
   * Move blob to quarantine (for infected files)
   */
  quarantine(contentHash: string): Promise<void>;

  /**
   * Scan blob for malware. Returns scan status.
   */
  scanForMalware(contentHash: string): Promise<'PENDING' | 'CLEAN' | 'INFECTED'>;

  /**
   * Delete blob (use with caution - should only be called after quarantine)
   */
  delete(contentHash: string): Promise<void>;
}

/**
 * Filesystem-based blob storage implementation
 *
 * Stores blobs in sharded directories based on hash prefix:
 * /var/regintel/evidence-blobs/ab/cd/abcdef123...
 */
export class FilesystemBlobStorage implements BlobStorageBackend {
  private readonly basePath: string;
  private readonly quarantinePath: string;

  constructor(basePath: string = '/var/regintel/evidence-blobs') {
    this.basePath = basePath;
    this.quarantinePath = join(basePath, '.quarantine');
  }

  async upload(content: Buffer, contentType: string): Promise<BlobMetadata> {
    // Compute SHA-256 hash
    const hashHex = createHash('sha256').update(content).digest('hex');
    const contentHash = `sha256:${hashHex}`;

    // Check if blob already exists (deduplication)
    const storagePath = this.getStoragePath(contentHash);
    if (await this.exists(contentHash)) {
      // Return existing metadata
      const stats = await fs.stat(storagePath);
      return {
        contentHash,
        contentType,
        sizeBytes: stats.size,
        uploadedAt: stats.birthtime.toISOString(),
        storagePath,
      };
    }

    // Create shard directory if needed
    const dir = dirname(storagePath);
    await fs.mkdir(dir, { recursive: true });

    // Write blob atomically (write to temp file, then rename)
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
        throw new Error(`Blob not found: ${contentHash}`);
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

    // Create quarantine directory
    await fs.mkdir(this.quarantinePath, { recursive: true });

    // Move file to quarantine
    try {
      await fs.rename(storagePath, quarantinedPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Blob not found: ${contentHash}`);
      }
      throw error;
    }
  }

  async scanForMalware(contentHash: string): Promise<'PENDING' | 'CLEAN' | 'INFECTED'> {
    // Stub implementation - always returns CLEAN
    // TODO: Integrate ClamAV, VirusTotal, or AWS Macie

    // In production, this would:
    // 1. Check if file exists
    // 2. Send to malware scanner
    // 3. Return actual scan result

    if (!(await this.exists(contentHash))) {
      throw new Error(`Blob not found: ${contentHash}`);
    }

    // For now, assume all files are clean
    return 'CLEAN';
  }

  async delete(contentHash: string): Promise<void> {
    const storagePath = this.getStoragePath(contentHash);

    try {
      await fs.unlink(storagePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Already deleted, no-op
        return;
      }
      throw error;
    }
  }

  /**
   * Get storage path for a content hash.
   * Uses 2-level sharding: /ab/cd/abcdef123...
   */
  private getStoragePath(contentHash: string): string {
    const hash = contentHash.replace('sha256:', '');

    // Shard by first 4 chars: /ab/cd/abcdef...
    const shard1 = hash.slice(0, 2);
    const shard2 = hash.slice(2, 4);

    return join(this.basePath, shard1, shard2, hash);
  }
}

/**
 * Default blob storage instance (filesystem)
 */
export const blobStorage: BlobStorageBackend = new FilesystemBlobStorage(
  process.env.BLOB_STORAGE_PATH || '/var/regintel/evidence-blobs'
);
