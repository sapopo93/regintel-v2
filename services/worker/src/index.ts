/**
 * Worker Service Entry Point
 *
 * Starts BullMQ workers for background processing.
 */

import { closeAllConnections } from '@regintel/queue';
import { config, validateConfig } from './config';
import { createMalwareScanWorker } from './workers/malware-scan.worker';
import { createEvidenceProcessWorker } from './workers/evidence-process.worker';
import { createScrapeReportWorker } from './workers/scrape-report.worker';
import { createAIEvidenceWorker } from './workers/ai-evidence.worker';
import { createAIPolicyWorker } from './workers/ai-policy.worker';
import { createAIInsightWorker } from './workers/ai-insight.worker';
import { getClamAVHealth } from './integrations/clamav';

const errors = validateConfig();
if (errors.length > 0) {
  console.error('[Worker] Invalid configuration:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const workers = [];

async function logClamAVHealth(): Promise<void> {
  const health = await getClamAVHealth();
  if (!health.enabled) {
    console.warn('[Worker] ClamAV disabled (CLAMAV_ENABLED=false)');
    return;
  }

  if (!health.available) {
    console.error('[Worker] ClamAV enabled but unavailable');
    return;
  }

  console.log(`[Worker] ClamAV available${health.version ? ` (${health.version})` : ''}`);
}

void logClamAVHealth();
setInterval(() => void logClamAVHealth(), 60000);

workers.push(createScrapeReportWorker());
workers.push(createMalwareScanWorker());
workers.push(createEvidenceProcessWorker());

if (config.gemini.enabled) {
  workers.push(createAIEvidenceWorker());
  workers.push(createAIPolicyWorker());
  workers.push(createAIInsightWorker());
} else {
  console.warn('[Worker] GEMINI_API_KEY not set - AI workers disabled');
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[Worker] Received ${signal}, shutting down...`);

  await Promise.all(
    workers.map((worker) =>
      worker.close().catch((err) => {
        console.error('[Worker] Error closing worker:', err.message);
      })
    )
  );

  await closeAllConnections().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

console.log('[Worker] Service started');
