import type { StorageConfig, StorageDriver, S3StorageConfig } from './types';

function parseDriver(value?: string): StorageDriver {
  const driver = (value || 'filesystem').toLowerCase();
  if (driver === 's3' || driver === 'minio' || driver === 'filesystem') {
    return driver;
  }
  return 'filesystem';
}

function parseBool(value?: string): boolean | undefined {
  if (value === undefined) return undefined;
  return value === 'true';
}

function buildS3Config(env: NodeJS.ProcessEnv, defaults?: Partial<S3StorageConfig>): S3StorageConfig {
  return {
    bucket: env.S3_BUCKET || defaults?.bucket || '',
    region: env.S3_REGION || defaults?.region || 'us-east-1',
    endpoint: env.S3_ENDPOINT || defaults?.endpoint,
    accessKeyId: env.S3_ACCESS_KEY_ID || defaults?.accessKeyId,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY || defaults?.secretAccessKey,
    forcePathStyle: parseBool(env.S3_FORCE_PATH_STYLE) ?? defaults?.forcePathStyle,
    prefix: env.S3_PREFIX || defaults?.prefix,
    quarantinePrefix: env.S3_QUARANTINE_PREFIX || defaults?.quarantinePrefix,
  };
}

function buildMinioConfig(env: NodeJS.ProcessEnv): S3StorageConfig {
  return {
    bucket: env.MINIO_BUCKET || env.S3_BUCKET || '',
    region: env.MINIO_REGION || env.S3_REGION || 'us-east-1',
    endpoint: env.MINIO_ENDPOINT || env.S3_ENDPOINT,
    accessKeyId: env.MINIO_ACCESS_KEY || env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.MINIO_SECRET_KEY || env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: parseBool(env.MINIO_FORCE_PATH_STYLE) ?? true,
    prefix: env.MINIO_PREFIX || env.S3_PREFIX,
    quarantinePrefix: env.MINIO_QUARANTINE_PREFIX || env.S3_QUARANTINE_PREFIX,
  };
}

export function loadStorageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const driver = parseDriver(env.STORAGE_DRIVER);

  if (driver === 'filesystem') {
    return {
      driver,
      filesystem: {
        basePath: env.BLOB_STORAGE_PATH || '/var/regintel/evidence-blobs',
      },
    };
  }

  if (driver === 'minio') {
    return {
      driver,
      minio: buildMinioConfig(env),
    };
  }

  return {
    driver,
    s3: buildS3Config(env),
  };
}

export function describeStorageConfig(config: StorageConfig): string {
  if (config.driver === 'filesystem') {
    return `filesystem:${config.filesystem?.basePath ?? ''}`;
  }
  if (config.driver === 'minio') {
    return `minio:${config.minio?.bucket ?? ''}`;
  }
  return `s3:${config.s3?.bucket ?? ''}`;
}
