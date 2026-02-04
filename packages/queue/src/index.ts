// Queue package - in-memory implementation for MVP
// TODO: Replace with BullMQ for production

export const QUEUE_NAMES = {
  SCRAPE_REPORT: 'scrape-report',
  MALWARE_SCAN: 'malware-scan',
  EVIDENCE_PROCESS: 'evidence-process',
  AI_INSIGHT: 'ai-insight',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface ScrapeReportJobData {
  facilityId: string;
  locationId: string;
  tenantId: string;
}

export interface ScrapeReportJobResult {
  success: boolean;
  reportDate?: string;
  error?: string;
}

export interface MalwareScanJobData {
  blobHash: string;
  tenantId: string;
}

export interface MalwareScanJobResult {
  clean: boolean;
  threats?: string[];
}

export interface EvidenceProcessJobData {
  evidenceRecordId: string;
  blobHash: string;
  tenantId: string;
}

export interface AIInsightJobData {
  sessionId: string;
  providerId: string;
  facilityId: string;
  tenantId: string;
}

export interface AIInsightJobResult {
  insights: string[];
  recommendations: string[];
}

interface Job<T, R> {
  id: string;
  data: T;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  result?: R;
  error?: string;
  createdAt: Date;
  processedAt?: Date;
}

interface QueueAdapter<T, R> {
  add(data: T): Promise<{ id: string }>;
  getJob(id: string): Promise<Job<T, R> | null>;
  isInMemory(): Promise<boolean>;
}

// In-memory job storage
const jobs = new Map<string, Job<unknown, unknown>>();

function createInMemoryQueue<T, R>(name: string): QueueAdapter<T, R> {
  return {
    async add(data: T): Promise<{ id: string }> {
      const id = `${name}:${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const job: Job<T, R> = {
        id,
        data,
        state: 'waiting',
        createdAt: new Date(),
      };
      jobs.set(id, job as Job<unknown, unknown>);
      return { id };
    },

    async getJob(id: string): Promise<Job<T, R> | null> {
      return (jobs.get(id) as Job<T, R>) ?? null;
    },

    async isInMemory(): Promise<boolean> {
      return true;
    },
  };
}

const queues = new Map<string, QueueAdapter<unknown, unknown>>();

export function getQueueAdapter<T, R>(name: QueueName): QueueAdapter<T, R> {
  if (!queues.has(name)) {
    queues.set(name, createInMemoryQueue(name));
  }
  return queues.get(name) as QueueAdapter<T, R>;
}

// Process job in-memory (for dev/test without Redis)
export async function processInMemoryJob<T, R>(
  queueName: QueueName,
  jobId: string,
  processor: (data: T) => Promise<R>
): Promise<void> {
  const job = jobs.get(jobId) as Job<T, R> | undefined;
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  job.state = 'active';
  
  try {
    const result = await processor(job.data);
    job.result = result;
    job.state = 'completed';
    job.processedAt = new Date();
  } catch (err) {
    job.state = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
    job.processedAt = new Date();
  }
}
