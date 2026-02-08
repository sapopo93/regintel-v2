import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import type { BlobMetadata, MalwareScanStatus, S3StorageConfig, StorageProvider } from './types';
import { StorageNotFoundError } from './errors';

function normalizePrefix(prefix?: string): string {
  if (!prefix) return '';
  return prefix.replace(/^\/+|\/+$/g, '');
}

function buildKey(prefix: string, contentHash: string): string {
  const hash = contentHash.replace('sha256:', '');
  const shard1 = hash.slice(0, 2);
  const shard2 = hash.slice(2, 4);
  const parts = [prefix, shard1, shard2, hash].filter(Boolean);
  return parts.join('/');
}

function storagePath(bucket: string, key: string): string {
  return `s3://${bucket}/${key}`;
}

function isNotFound(error: unknown): boolean {
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err?.name === 'NotFound' || err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404;
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    return Buffer.from('');
  }
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof body === 'string') {
    return Buffer.from(body);
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  const maybeStream = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof maybeStream.transformToByteArray === 'function') {
    const bytes = await maybeStream.transformToByteArray();
    return Buffer.from(bytes);
  }
  throw new Error('Unsupported S3 body type');
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly quarantinePrefix: string;

  constructor(config: S3StorageConfig) {
    if (!config.bucket) {
      throw new Error('S3 bucket is required');
    }

    this.bucket = config.bucket;
    this.prefix = normalizePrefix(config.prefix);
    this.quarantinePrefix = normalizePrefix(
      config.quarantinePrefix ?? (this.prefix ? `${this.prefix}/.quarantine` : '.quarantine')
    );

    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            }
          : undefined,
    });
  }

  async upload(content: Buffer, contentType: string): Promise<BlobMetadata> {
    const hashHex = createHash('sha256').update(content).digest('hex');
    const contentHash = `sha256:${hashHex}`;
    const key = buildKey(this.prefix, contentHash);

    const existing = await this.headObject(key);
    if (existing) {
      return {
        contentHash,
        contentType,
        sizeBytes: existing.ContentLength ?? content.length,
        uploadedAt: existing.LastModified ? existing.LastModified.toISOString() : new Date().toISOString(),
        storagePath: storagePath(this.bucket, key),
      };
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: contentType,
      })
    );

    return {
      contentHash,
      contentType,
      sizeBytes: content.length,
      uploadedAt: new Date().toISOString(),
      storagePath: storagePath(this.bucket, key),
    };
  }

  async download(contentHash: string): Promise<Buffer> {
    const key = buildKey(this.prefix, contentHash);
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return await bodyToBuffer(result.Body);
    } catch (error) {
      if (isNotFound(error)) {
        throw new StorageNotFoundError(contentHash);
      }
      throw error;
    }
  }

  async exists(contentHash: string): Promise<boolean> {
    const key = buildKey(this.prefix, contentHash);
    return !!(await this.headObject(key));
  }

  async quarantine(contentHash: string): Promise<void> {
    const key = buildKey(this.prefix, contentHash);
    const quarantineKey = buildKey(this.quarantinePrefix, contentHash);

    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: `${this.bucket}/${key}`,
          Key: quarantineKey,
        })
      );
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
    } catch (error) {
      if (isNotFound(error)) {
        throw new StorageNotFoundError(contentHash);
      }
      throw error;
    }
  }

  async scanForMalware(contentHash: string): Promise<MalwareScanStatus> {
    if (!(await this.exists(contentHash))) {
      throw new StorageNotFoundError(contentHash);
    }

    // Stub - real scanning should be performed by worker.
    return 'PENDING';
  }

  async delete(contentHash: string): Promise<void> {
    const key = buildKey(this.prefix, contentHash);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
    } catch (error) {
      if (isNotFound(error)) {
        return;
      }
      throw error;
    }
  }

  private async headObject(key: string) {
    try {
      return await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }
}
