export type MalwareScanStatus = 'PENDING' | 'CLEAN' | 'INFECTED';

export interface BlobMetadata {
  contentHash: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  storagePath: string;
}

export interface StorageProvider {
  upload(content: Buffer, contentType: string): Promise<BlobMetadata>;
  download(contentHash: string): Promise<Buffer>;
  exists(contentHash: string): Promise<boolean>;
  quarantine(contentHash: string): Promise<void>;
  delete(contentHash: string): Promise<void>;
  scanForMalware?(contentHash: string): Promise<MalwareScanStatus>;
}

export type StorageDriver = 'filesystem' | 's3' | 'minio';

export interface FilesystemStorageConfig {
  basePath: string;
}

export interface S3StorageConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  prefix?: string;
  quarantinePrefix?: string;
}

export interface StorageConfig {
  driver: StorageDriver;
  filesystem?: FilesystemStorageConfig;
  s3?: S3StorageConfig;
  minio?: S3StorageConfig;
}
