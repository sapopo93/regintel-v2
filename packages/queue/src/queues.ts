/**
 * Queue Definitions and Configuration
 *
 * Defines all BullMQ queues with their configuration.
 * Each queue has specific retry policies and concurrency settings.
 */

import { Queue, type QueueOptions, type JobsOptions } from 'bullmq';
import { createQueueConnection } from './connection';
import type {
  ScrapeReportJobData,
  MalwareScanJobData,
  EvidenceProcessJobData,
  AIEvidenceJobData,
  AIPolicyJobData,
  AIInsightJobData,
} from './types';

/**
 * Queue names as constants
 */
export const QUEUE_NAMES = {
  SCRAPE_REPORT: 'scrape-report',
  MALWARE_SCAN: 'malware-scan',
  EVIDENCE_PROCESS: 'evidence-process',
  AI_EVIDENCE: 'ai-evidence-analysis',
  AI_POLICY: 'ai-policy-generation',
  AI_INSIGHT: 'ai-mock-insight',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Default job options per queue type
 */
export const DEFAULT_JOB_OPTIONS: Record<QueueName, JobsOptions> = {
  [QUEUE_NAMES.SCRAPE_REPORT]: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 10s, 20s
    },
    removeOnComplete: { age: 86400, count: 1000 }, // Keep 24h or 1000 jobs
    removeOnFail: { age: 604800, count: 5000 }, // Keep 7d or 5000 jobs
  },
  [QUEUE_NAMES.MALWARE_SCAN]: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 1000,
    },
    removeOnComplete: { age: 3600, count: 10000 }, // Keep 1h or 10000 jobs
    removeOnFail: { age: 604800, count: 5000 },
  },
  [QUEUE_NAMES.EVIDENCE_PROCESS]: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { age: 86400, count: 5000 },
    removeOnFail: { age: 604800, count: 5000 },
  },
  [QUEUE_NAMES.AI_EVIDENCE]: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
    removeOnComplete: { age: 86400, count: 5000 },
    removeOnFail: { age: 604800, count: 5000 },
  },
  [QUEUE_NAMES.AI_POLICY]: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
    removeOnComplete: { age: 86400, count: 5000 },
    removeOnFail: { age: 604800, count: 5000 },
  },
  [QUEUE_NAMES.AI_INSIGHT]: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 3000,
    },
    removeOnComplete: { age: 86400, count: 10000 },
    removeOnFail: { age: 604800, count: 5000 },
  },
};

/**
 * Worker concurrency per queue
 */
export const WORKER_CONCURRENCY: Record<QueueName, number> = {
  [QUEUE_NAMES.SCRAPE_REPORT]: 5,
  [QUEUE_NAMES.MALWARE_SCAN]: 3,
  [QUEUE_NAMES.EVIDENCE_PROCESS]: 10,
  [QUEUE_NAMES.AI_EVIDENCE]: 10,
  [QUEUE_NAMES.AI_POLICY]: 10,
  [QUEUE_NAMES.AI_INSIGHT]: 10,
};

/**
 * Type-safe queue creation
 */
export type QueueDataMap = {
  [QUEUE_NAMES.SCRAPE_REPORT]: ScrapeReportJobData;
  [QUEUE_NAMES.MALWARE_SCAN]: MalwareScanJobData;
  [QUEUE_NAMES.EVIDENCE_PROCESS]: EvidenceProcessJobData;
  [QUEUE_NAMES.AI_EVIDENCE]: AIEvidenceJobData;
  [QUEUE_NAMES.AI_POLICY]: AIPolicyJobData;
  [QUEUE_NAMES.AI_INSIGHT]: AIInsightJobData;
};

/**
 * Queue instances cache
 */
const queueInstances = new Map<QueueName, Queue>();

/**
 * Get or create a queue instance
 */
export function getQueue<T extends QueueName>(
  name: T,
  options?: Partial<QueueOptions>
): Queue<QueueDataMap[T]> {
  const existing = queueInstances.get(name);
  if (existing) {
    return existing as Queue<QueueDataMap[T]>;
  }

  const connection = createQueueConnection(name);
  const queue = new Queue<QueueDataMap[T]>(name, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS[name],
    ...options,
  });

  queueInstances.set(name, queue as Queue);
  return queue;
}

/**
 * Close all queue instances
 */
export async function closeAllQueues(): Promise<void> {
  const closePromises = Array.from(queueInstances.values()).map((queue) =>
    queue.close().catch(() => {})
  );
  await Promise.all(closePromises);
  queueInstances.clear();
}

/**
 * Get queue health metrics
 */
export async function getQueueMetrics(name: QueueName): Promise<{
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getQueue(name);
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { name, waiting, active, completed, failed, delayed };
}

/**
 * Get all queues metrics
 */
export async function getAllQueuesMetrics(): Promise<
  Array<{
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }>
> {
  const names = Object.values(QUEUE_NAMES);
  return Promise.all(names.map((name) => getQueueMetrics(name)));
}
