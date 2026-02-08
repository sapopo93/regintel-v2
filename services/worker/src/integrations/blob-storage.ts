/**
 * Blob Storage Integration
 *
 * Uses shared @regintel/storage provider (filesystem, S3, or MinIO).
 */

import {
  createStorageProvider,
  loadStorageConfigFromEnv,
  FilesystemBlobStorage,
  StorageNotFoundError,
  type StorageProvider,
} from '@regintel/storage';

const storage: StorageProvider = createStorageProvider(loadStorageConfigFromEnv());

/**
 * Resolve filesystem path for a blob hash.
 * Only valid when using filesystem storage.
 */
export function getBlobPath(contentHash: string): string {
  if (storage instanceof FilesystemBlobStorage) {
    return storage.getStoragePath(contentHash);
  }
  throw new Error('getBlobPath is only available for filesystem storage');
}

/**
 * Read blob content from storage.
 */
export async function readBlob(contentHash: string): Promise<Buffer | null> {
  try {
    return await storage.download(contentHash);
  } catch (error) {
    if (error instanceof StorageNotFoundError) {
      return null;
    }
    throw error;
  }
}

/**
 * Check if blob exists.
 */
export async function blobExists(contentHash: string): Promise<boolean> {
  return storage.exists(contentHash);
}

/**
 * Move blob to quarantine.
 */
export async function quarantineBlob(contentHash: string): Promise<void> {
  await storage.quarantine(contentHash);
}
