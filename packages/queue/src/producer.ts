/**
 * Job Producer
 *
 * Type-safe job enqueueing for all queue types.
 * Provides a simple API to add jobs to queues with proper typing.
 */

import type { Job, JobsOptions } from 'bullmq';
import { getQueue, QUEUE_NAMES, type QueueName, type QueueDataMap } from './queues';
import type {
  ScrapeReportJobData,
  MalwareScanJobData,
  EvidenceProcessJobData,
  AIEvidenceJobData,
  AIPolicyJobData,
  AIInsightJobData,
  JobMetadata,
} from './types';

/**
 * Generate a unique job ID
 */
function generateJobId(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Add metadata to job data
 */
function withMetadata<T extends { tenantId: string; actorId: string }>(
  data: T,
  options?: { priority?: number }
): T & { _metadata: JobMetadata } {
  return {
    ...data,
    _metadata: {
      enqueuedAt: new Date().toISOString(),
      enqueuedBy: data.actorId,
      priority: options?.priority,
      attemptsMade: 0,
      maxAttempts: 3,
    },
  };
}

/**
 * Generic job enqueue function
 */
export async function enqueueJob<T extends QueueName>(
  queueName: T,
  data: QueueDataMap[T],
  options?: JobsOptions & { priority?: number }
): Promise<Job<QueueDataMap[T]>> {
  const queue = getQueue(queueName);
  const jobId = generateJobId(queueName);
  const dataWithMetadata = withMetadata(data, options);

  return queue.add(queueName, dataWithMetadata, {
    jobId,
    priority: options?.priority,
    ...options,
  });
}

/**
 * Enqueue a report scraping job
 */
export async function enqueueScrapeReport(
  data: ScrapeReportJobData,
  options?: JobsOptions
): Promise<Job<ScrapeReportJobData>> {
  return enqueueJob(QUEUE_NAMES.SCRAPE_REPORT, data, options);
}

/**
 * Enqueue a malware scan job
 */
export async function enqueueMalwareScan(
  data: MalwareScanJobData,
  options?: JobsOptions
): Promise<Job<MalwareScanJobData>> {
  return enqueueJob(QUEUE_NAMES.MALWARE_SCAN, data, {
    priority: 1, // High priority for security scans
    ...options,
  });
}

/**
 * Enqueue an evidence processing job
 */
export async function enqueueEvidenceProcess(
  data: EvidenceProcessJobData,
  options?: JobsOptions
): Promise<Job<EvidenceProcessJobData>> {
  return enqueueJob(QUEUE_NAMES.EVIDENCE_PROCESS, data, options);
}

/**
 * Enqueue an AI evidence analysis job
 */
export async function enqueueAIEvidence(
  data: AIEvidenceJobData,
  options?: JobsOptions
): Promise<Job<AIEvidenceJobData>> {
  return enqueueJob(QUEUE_NAMES.AI_EVIDENCE, data, options);
}

/**
 * Enqueue an AI policy generation job
 */
export async function enqueueAIPolicy(
  data: AIPolicyJobData,
  options?: JobsOptions
): Promise<Job<AIPolicyJobData>> {
  return enqueueJob(QUEUE_NAMES.AI_POLICY, data, options);
}

/**
 * Enqueue an AI mock insight job
 */
export async function enqueueAIInsight(
  data: AIInsightJobData,
  options?: JobsOptions
): Promise<Job<AIInsightJobData>> {
  return enqueueJob(QUEUE_NAMES.AI_INSIGHT, data, options);
}

/**
 * Bulk enqueue multiple jobs of the same type
 */
export async function enqueueBulk<T extends QueueName>(
  queueName: T,
  jobs: Array<{ data: QueueDataMap[T]; options?: JobsOptions }>
): Promise<Array<Job<QueueDataMap[T]>>> {
  const queue = getQueue(queueName);

  const bulkJobs = jobs.map(({ data, options }) => ({
    name: queueName,
    data: withMetadata(data, options),
    opts: {
      jobId: generateJobId(queueName),
      ...options,
    },
  }));

  return queue.addBulk(bulkJobs);
}

/**
 * Get job status by ID
 */
export async function getJobStatus<T extends QueueName>(
  queueName: T,
  jobId: string
): Promise<{
  id: string;
  state: string;
  progress: number;
  data: QueueDataMap[T];
  returnvalue?: unknown;
  failedReason?: string;
  attemptsMade: number;
  timestamp: number;
  finishedOn?: number;
} | null> {
  const queue = getQueue(queueName);
  const job = await queue.getJob(jobId);

  if (!job) return null;

  const state = await job.getState();

  return {
    id: job.id || jobId,
    state,
    progress: job.progress as number,
    data: job.data,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    finishedOn: job.finishedOn,
  };
}

/**
 * Remove a job by ID
 */
export async function removeJob<T extends QueueName>(
  queueName: T,
  jobId: string
): Promise<boolean> {
  const queue = getQueue(queueName);
  const job = await queue.getJob(jobId);

  if (!job) return false;

  await job.remove();
  return true;
}

/**
 * Retry a failed job
 */
export async function retryJob<T extends QueueName>(
  queueName: T,
  jobId: string
): Promise<boolean> {
  const queue = getQueue(queueName);
  const job = await queue.getJob(jobId);

  if (!job) return false;

  const state = await job.getState();
  if (state !== 'failed') return false;

  await job.retry();
  return true;
}
