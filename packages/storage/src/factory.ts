import type { StorageConfig, StorageProvider } from './types';
import { FilesystemBlobStorage } from './filesystem';
import { S3StorageProvider } from './s3';

export function createStorageProvider(config: StorageConfig): StorageProvider {
  if (config.driver === 'filesystem') {
    const basePath = config.filesystem?.basePath || '/var/regintel/evidence-blobs';
    return new FilesystemBlobStorage(basePath);
  }

  if (config.driver === 'minio') {
    if (!config.minio) {
      throw new Error('MinIO configuration missing');
    }
    return new S3StorageProvider({
      ...config.minio,
      forcePathStyle: config.minio.forcePathStyle ?? true,
    });
  }

  if (!config.s3) {
    throw new Error('S3 configuration missing');
  }

  return new S3StorageProvider(config.s3);
}
