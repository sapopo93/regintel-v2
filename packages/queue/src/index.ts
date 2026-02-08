/**
 * @regintel/queue
 *
 * BullMQ-based job queue infrastructure for RegIntel v2.
 *
 * Features:
 * - Type-safe job definitions
 * - Redis connection pooling
 * - Automatic in-memory fallback for development
 * - Queue metrics and health checks
 *
 * @example
 * ```typescript
 * import { enqueueMalwareScan, QUEUE_NAMES } from '@regintel/queue';
 *
 * // Enqueue a malware scan job
 * const job = await enqueueMalwareScan({
 *   tenantId: 'demo',
 *   actorId: 'user-123',
 *   blobHash: 'sha256:abc123...',
 * });
 *
 * // Check job status
 * const status = await getJobStatus(QUEUE_NAMES.MALWARE_SCAN, job.id);
 * ```
 */

// Types
export * from './types';

// Queue definitions
export { QUEUE_NAMES, WORKER_CONCURRENCY, getQueue, closeAllQueues, getQueueMetrics, getAllQueuesMetrics } from './queues';
export type { QueueName, QueueDataMap } from './queues';

// Connection management
export { createQueueConnection, createWorkerConnection, closeAllConnections, getRedisConfig } from './connection';

// Job producers
export {
  enqueueJob,
  enqueueScrapeReport,
  enqueueMalwareScan,
  enqueueEvidenceProcess,
  enqueueAIEvidence,
  enqueueAIPolicy,
  enqueueAIInsight,
  enqueueBulk,
  getJobStatus,
  removeJob,
  retryJob,
} from './producer';

// Adapter for backward compatibility
export { QueueAdapter, getQueueAdapter, processInMemoryJob, clearInMemoryQueue } from './adapter';
