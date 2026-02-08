/**
 * Queue Package Tests
 *
 * Tests for job types, adapter, and in-memory fallback.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  QUEUE_NAMES,
  WORKER_CONCURRENCY,
  getQueueAdapter,
  clearInMemoryQueue,
  processInMemoryJob,
} from './index';
import type {
  MalwareScanJobData,
  ScrapeReportJobData,
  AIEvidenceJobData,
} from './types';
import { EvidenceType } from '@regintel/domain/evidence-types';

describe('queue:types', () => {
  it('should have all required queue names', () => {
    expect(QUEUE_NAMES.SCRAPE_REPORT).toBe('scrape-report');
    expect(QUEUE_NAMES.MALWARE_SCAN).toBe('malware-scan');
    expect(QUEUE_NAMES.EVIDENCE_PROCESS).toBe('evidence-process');
    expect(QUEUE_NAMES.AI_EVIDENCE).toBe('ai-evidence-analysis');
    expect(QUEUE_NAMES.AI_POLICY).toBe('ai-policy-generation');
    expect(QUEUE_NAMES.AI_INSIGHT).toBe('ai-mock-insight');
  });

  it('should have concurrency settings for all queues', () => {
    expect(WORKER_CONCURRENCY[QUEUE_NAMES.MALWARE_SCAN]).toBe(3);
    expect(WORKER_CONCURRENCY[QUEUE_NAMES.EVIDENCE_PROCESS]).toBe(10);
    expect(WORKER_CONCURRENCY[QUEUE_NAMES.AI_EVIDENCE]).toBe(10);
  });
});

describe('queue:adapter', () => {
  beforeEach(() => {
    // Force in-memory mode for tests
    process.env.FORCE_IN_MEMORY_QUEUE = 'true';
    clearInMemoryQueue();
  });

  afterEach(() => {
    delete process.env.FORCE_IN_MEMORY_QUEUE;
    clearInMemoryQueue();
  });

  it('should add job to in-memory queue', async () => {
    const adapter = getQueueAdapter(QUEUE_NAMES.MALWARE_SCAN);
    const data: MalwareScanJobData = {
      tenantId: 'demo',
      actorId: 'user-1',
      blobHash: 'sha256:abc123',
      mimeType: 'application/pdf',
    };

    const job = await adapter.add(data);
    expect(job.id).toBeDefined();
    expect(job.data.blobHash).toBe('sha256:abc123');
  });

  it('should retrieve job status', async () => {
    const adapter = getQueueAdapter(QUEUE_NAMES.MALWARE_SCAN);
    const data: MalwareScanJobData = {
      tenantId: 'demo',
      actorId: 'user-1',
      blobHash: 'sha256:abc123',
    };

    const job = await adapter.add(data);
    const status = await adapter.getJob(job.id);

    expect(status).not.toBeNull();
    expect(status?.state).toBe('waiting');
    expect(status?.data.blobHash).toBe('sha256:abc123');
  });

  it('should return null for non-existent job', async () => {
    const adapter = getQueueAdapter(QUEUE_NAMES.MALWARE_SCAN);
    const status = await adapter.getJob('non-existent-job-id');
    expect(status).toBeNull();
  });

  it('should track queue metrics', async () => {
    const adapter = getQueueAdapter(QUEUE_NAMES.MALWARE_SCAN);

    // Add multiple jobs
    await adapter.add({ tenantId: 'demo', actorId: 'user-1', blobHash: 'sha256:a' });
    await adapter.add({ tenantId: 'demo', actorId: 'user-1', blobHash: 'sha256:b' });
    await adapter.add({ tenantId: 'demo', actorId: 'user-1', blobHash: 'sha256:c' });

    const metrics = await adapter.getMetrics();
    expect(metrics.waiting).toBe(3);
    expect(metrics.active).toBe(0);
    expect(metrics.completed).toBe(0);
    expect(metrics.failed).toBe(0);
  });

  it('should process job and update state', async () => {
    const adapter = getQueueAdapter(QUEUE_NAMES.MALWARE_SCAN);
    const data: MalwareScanJobData = {
      tenantId: 'demo',
      actorId: 'user-1',
      blobHash: 'sha256:test',
    };

    const job = await adapter.add(data);

    // Process the job
    await processInMemoryJob(QUEUE_NAMES.MALWARE_SCAN, job.id, async (jobData) => {
      return { status: 'CLEAN', scannedAt: new Date().toISOString() };
    });

    const status = await adapter.getJob(job.id);
    expect(status?.state).toBe('completed');
    expect(status?.returnvalue).toEqual({
      status: 'CLEAN',
      scannedAt: expect.any(String),
    });
  });

  it('should handle job failure', async () => {
    const adapter = getQueueAdapter(QUEUE_NAMES.MALWARE_SCAN);
    const data: MalwareScanJobData = {
      tenantId: 'demo',
      actorId: 'user-1',
      blobHash: 'sha256:test',
    };

    const job = await adapter.add(data);

    // Process the job with failure
    await processInMemoryJob(QUEUE_NAMES.MALWARE_SCAN, job.id, async () => {
      throw new Error('Scanner unavailable');
    });

    const status = await adapter.getJob(job.id);
    expect(status?.state).toBe('failed');
    expect(status?.failedReason).toBe('Scanner unavailable');
  });
});

describe('queue:job-data-validation', () => {
  it('should require tenant context in all job types', () => {
    const scrapeJob: ScrapeReportJobData = {
      tenantId: 'demo',
      actorId: 'user-1',
      facilityId: 'facility-1',
      cqcLocationId: '1-123456789',
      providerId: 'provider-1',
    };

    expect(scrapeJob.tenantId).toBeDefined();
    expect(scrapeJob.actorId).toBeDefined();
  });

  it('should allow evidence type in AI evidence job', () => {
    const aiJob: AIEvidenceJobData = {
      tenantId: 'demo',
      actorId: 'user-1',
      evidenceRecordId: 'rec-1',
      blobHash: 'sha256:abc',
      evidenceType: EvidenceType.POLICY,
      fileName: 'policy.pdf',
      facilityId: 'facility-1',
      providerId: 'provider-1',
    };

    expect(aiJob.evidenceType).toBe(EvidenceType.POLICY);
  });
});
