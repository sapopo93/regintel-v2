/**
 * Backward Compatibility Adapter
 *
 * Provides an in-memory fallback when Redis is not available.
 * Used for development and testing without Redis dependency.
 */

import type { Job, JobsOptions } from 'bullmq';
import type { QueueName, QueueDataMap } from './queues';
import type { JobStatus } from './types';

/**
 * In-memory job storage for fallback mode
 */
interface InMemoryJob<T = unknown> {
  id: string;
  name: string;
  data: T;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  progress: number;
  returnvalue?: unknown;
  failedReason?: string;
  attemptsMade: number;
  timestamp: number;
  finishedOn?: number;
  opts: JobsOptions;
}

/**
 * Simple event emitter for job completion
 */
type JobEventHandler = (job: InMemoryJob) => void;

class InMemoryJobStore {
  private jobs = new Map<string, InMemoryJob>();
  private handlers = new Map<string, JobEventHandler[]>();
  private processorTimeout = 100; // Simulated processing time in ms

  async add<T>(
    queueName: string,
    data: T,
    opts: JobsOptions = {}
  ): Promise<InMemoryJob<T>> {
    const id = opts.jobId || `${queueName}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const job: InMemoryJob<T> = {
      id,
      name: queueName,
      data,
      state: 'waiting',
      progress: 0,
      attemptsMade: 0,
      timestamp: Date.now(),
      opts,
    };

    this.jobs.set(id, job as InMemoryJob);
    return job;
  }

  async get<T>(id: string): Promise<InMemoryJob<T> | null> {
    return (this.jobs.get(id) as InMemoryJob<T>) || null;
  }

  async remove(id: string): Promise<boolean> {
    return this.jobs.delete(id);
  }

  async update(id: string, updates: Partial<InMemoryJob>): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      Object.assign(job, updates);
    }
  }

  async listByQueue(queueName: string): Promise<InMemoryJob[]> {
    return Array.from(this.jobs.values()).filter((job) => job.name === queueName);
  }

  async getWaiting(queueName: string): Promise<number> {
    return (await this.listByQueue(queueName)).filter((j) => j.state === 'waiting').length;
  }

  async getActive(queueName: string): Promise<number> {
    return (await this.listByQueue(queueName)).filter((j) => j.state === 'active').length;
  }

  async getCompleted(queueName: string): Promise<number> {
    return (await this.listByQueue(queueName)).filter((j) => j.state === 'completed').length;
  }

  async getFailed(queueName: string): Promise<number> {
    return (await this.listByQueue(queueName)).filter((j) => j.state === 'failed').length;
  }

  onComplete(queueName: string, handler: JobEventHandler): void {
    const handlers = this.handlers.get(queueName) || [];
    handlers.push(handler);
    this.handlers.set(queueName, handlers);
  }

  async complete(id: string, returnvalue?: unknown): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      job.state = 'completed';
      job.returnvalue = returnvalue;
      job.finishedOn = Date.now();

      const handlers = this.handlers.get(job.name) || [];
      for (const handler of handlers) {
        handler(job);
      }
    }
  }

  async fail(id: string, error: string): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      job.state = 'failed';
      job.failedReason = error;
      job.finishedOn = Date.now();
    }
  }

  clear(): void {
    this.jobs.clear();
    this.handlers.clear();
  }
}

/**
 * Singleton in-memory store
 */
const inMemoryStore = new InMemoryJobStore();

/**
 * Check if Redis is available
 */
async function isRedisAvailable(): Promise<boolean> {
  if (process.env.FORCE_IN_MEMORY_QUEUE === 'true') {
    return false;
  }

  if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
    return false;
  }

  try {
    const { connectionPool } = await import('./connection');
    return await connectionPool.healthCheck();
  } catch {
    return false;
  }
}

/**
 * Adapter that automatically switches between BullMQ and in-memory
 */
export class QueueAdapter<T extends QueueName> {
  private queueName: T;
  private useInMemory: boolean | null = null;

  constructor(queueName: T) {
    this.queueName = queueName;
  }

  private async shouldUseInMemory(): Promise<boolean> {
    if (this.useInMemory === null) {
      this.useInMemory = !(await isRedisAvailable());
      if (this.useInMemory) {
        console.log(`[Queue:${this.queueName}] Using in-memory fallback (Redis not available)`);
      }
    }
    return this.useInMemory;
  }

  /**
   * Expose whether adapter is using in-memory mode
   */
  async isInMemory(): Promise<boolean> {
    return this.shouldUseInMemory();
  }

  async add(
    data: QueueDataMap[T],
    opts?: JobsOptions
  ): Promise<{ id: string; data: QueueDataMap[T] }> {
    if (await this.shouldUseInMemory()) {
      const job = await inMemoryStore.add(this.queueName, data, opts);
      return { id: job.id, data: job.data as QueueDataMap[T] };
    }

    const { enqueueJob } = await import('./producer');
    const job = await enqueueJob(this.queueName, data, opts);
    return { id: job.id || '', data: job.data };
  }

  async getJob(
    jobId: string
  ): Promise<{
    id: string;
    state: string;
    data: QueueDataMap[T];
    returnvalue?: unknown;
    failedReason?: string;
    attemptsMade?: number;
    timestamp?: number;
    finishedOn?: number;
  } | null> {
    if (await this.shouldUseInMemory()) {
      const job = await inMemoryStore.get<QueueDataMap[T]>(jobId);
      if (!job) return null;
      return {
        id: job.id,
        state: job.state,
        data: job.data,
        returnvalue: job.returnvalue,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        finishedOn: job.finishedOn,
      };
    }

    const { getJobStatus } = await import('./producer');
    const status = await getJobStatus(this.queueName, jobId);
    if (!status) return null;
    return {
      id: status.id,
      state: status.state,
      data: status.data,
      returnvalue: status.returnvalue,
      failedReason: status.failedReason,
      attemptsMade: status.attemptsMade,
      timestamp: status.timestamp,
      finishedOn: status.finishedOn,
    };
  }

  async getMetrics(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    if (await this.shouldUseInMemory()) {
      return {
        waiting: await inMemoryStore.getWaiting(this.queueName),
        active: await inMemoryStore.getActive(this.queueName),
        completed: await inMemoryStore.getCompleted(this.queueName),
        failed: await inMemoryStore.getFailed(this.queueName),
      };
    }

    const { getQueueMetrics } = await import('./queues');
    const metrics = await getQueueMetrics(this.queueName);
    return {
      waiting: metrics.waiting,
      active: metrics.active,
      completed: metrics.completed,
      failed: metrics.failed,
    };
  }
}

/**
 * Get an adapter for a specific queue
 */
export function getQueueAdapter<T extends QueueName>(queueName: T): QueueAdapter<T> {
  return new QueueAdapter(queueName);
}

/**
 * Process jobs in in-memory mode (for testing)
 */
export async function processInMemoryJob<T extends QueueName>(
  queueName: T,
  jobId: string,
  processor: (data: QueueDataMap[T]) => Promise<unknown>
): Promise<void> {
  const job = await inMemoryStore.get<QueueDataMap[T]>(jobId);
  if (!job || job.state !== 'waiting') return;

  await inMemoryStore.update(jobId, { state: 'active' });

  try {
    const result = await processor(job.data);
    await inMemoryStore.complete(jobId, result);
  } catch (error) {
    await inMemoryStore.fail(
      jobId,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

/**
 * Clear all in-memory jobs (for testing)
 */
export function clearInMemoryQueue(): void {
  inMemoryStore.clear();
}
