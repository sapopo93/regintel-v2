/**
 * Blob Storage Backend (API Wrapper)
 *
 * Delegates to @regintel/storage to ensure a single storage abstraction.
 */

import {
  createStorageProvider,
  loadStorageConfigFromEnv,
  type StorageProvider,
  type BlobMetadata,
  FilesystemBlobStorage,
  StorageNotFoundError,
} from '@regintel/storage';

export type { StorageProvider, BlobMetadata };
export { FilesystemBlobStorage, StorageNotFoundError };

/**
 * Default blob storage instance
 */
// Lazy initialization to allow tests to override env vars before first use
let _instance: StorageProvider | null = null;

function getInstance(): StorageProvider {
  if (!_instance) {
    _instance = createStorageProvider(loadStorageConfigFromEnv());
  }
  return _instance;
}

export const blobStorage: StorageProvider = {
  upload: (content, mimeType) => getInstance().upload(content, mimeType),
  download: (hash) => getInstance().download(hash),
  exists: (hash) => getInstance().exists(hash),
  delete: (hash) => getInstance().delete(hash),
};
