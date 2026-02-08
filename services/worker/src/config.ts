/**
 * Worker Configuration
 *
 * Environment-based configuration for the worker service.
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load environment variables from root .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, '../../../.env') });

export interface WorkerConfig {
  // Redis
  redis: {
    url?: string;
    host: string;
    port: number;
    password?: string;
    db: number;
  };

  // Database
  database: {
    url: string;
  };

  // Blob storage
  blobStorage: {
    path: string;
  };

  // ClamAV
  clamav: {
    socketPath: string;
    timeout: number;
    enabled: boolean;
  };

  // Tesseract OCR
  tesseract: {
    enabled: boolean;
    lang: string;
  };

  // Gemini AI
  gemini: {
    apiKey?: string;
    modelId: string;
    enabled: boolean;
  };

  // Worker settings
  worker: {
    concurrency: {
      scrapeReport: number;
      malwareScan: number;
      evidenceProcess: number;
      aiEvidence: number;
      aiPolicy: number;
      aiInsight: number;
    };
  };

  // Logging
  logging: {
    level: string;
    json: boolean;
  };
}

export const config: WorkerConfig = {
  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  database: {
    url: process.env.DATABASE_URL || 'postgres://localhost:5432/regintel_dev',
  },

  blobStorage: {
    path: process.env.BLOB_STORAGE_PATH || '/var/regintel/evidence-blobs',
  },

  clamav: {
    socketPath: process.env.CLAMD_SOCKET || '/var/run/clamav/clamd.ctl',
    timeout: parseInt(process.env.CLAMD_TIMEOUT || '30000', 10),
    enabled: process.env.CLAMAV_ENABLED !== 'false',
  },

  tesseract: {
    enabled: process.env.TESSERACT_ENABLED !== 'false',
    lang: process.env.TESSERACT_LANG || 'eng',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    modelId: process.env.GEMINI_MODEL_ID || 'gemini-2.0-flash',
    enabled: !!process.env.GEMINI_API_KEY,
  },

  worker: {
    concurrency: {
      scrapeReport: parseInt(process.env.WORKER_CONCURRENCY_SCRAPE || '5', 10),
      malwareScan: parseInt(process.env.WORKER_CONCURRENCY_MALWARE || '3', 10),
      evidenceProcess: parseInt(process.env.WORKER_CONCURRENCY_EVIDENCE || '10', 10),
      aiEvidence: parseInt(process.env.WORKER_CONCURRENCY_AI_EVIDENCE || '10', 10),
      aiPolicy: parseInt(process.env.WORKER_CONCURRENCY_AI_POLICY || '10', 10),
      aiInsight: parseInt(process.env.WORKER_CONCURRENCY_AI_INSIGHT || '10', 10),
    },
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    json: process.env.LOG_JSON === 'true',
  },
};

/**
 * Validate configuration
 */
export function validateConfig(): string[] {
  const errors: string[] = [];

  // Check Redis
  if (!config.redis.url && !config.redis.host) {
    errors.push('Redis connection not configured (REDIS_URL or REDIS_HOST required)');
  }

  // Check Database
  if (!config.database.url) {
    errors.push('Database URL not configured (DATABASE_URL required)');
  }

  // Check AI (warning only)
  if (!config.gemini.apiKey) {
    console.warn('[Config] GEMINI_API_KEY not set - AI features will be disabled');
  }

  return errors;
}
