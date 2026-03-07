/**
 * audit-worker.ts
 * Background worker - drains the DOCUMENT_AUDIT queue so the API
 * never blocks on Anthropic calls. One job at a time (concurrency=1)
 * keeps peak memory bounded to ~512MB per audit.
 */
import {
  QUEUE_NAMES,
  consumeWaitingJobs,
  processInMemoryJob,
} from '@regintel/queue';
import { runDocumentAuditForEvidence } from './document-auditor';

export interface DocumentAuditJobData {
  tenantId: string;
  facilityId: string;
  facilityName: string;
  providerId: string;
  evidenceRecordId: string;
  blobHash: string;
  fileName: string;
  mimeType: string;
}

const POLL_MS = 2000;
let busy = false;

async function processPendingAudits() {
  if (busy) return;
  const jobIds = consumeWaitingJobs(QUEUE_NAMES.DOCUMENT_AUDIT);
  if (jobIds.length === 0) return;

  busy = true;
  const jobId = jobIds[0];
  console.log(`[AUDIT-WORKER] Processing job ${jobId}`);

  try {
    await processInMemoryJob<DocumentAuditJobData, void>(
      QUEUE_NAMES.DOCUMENT_AUDIT,
      jobId,
      async (data) => {
        await runDocumentAuditForEvidence({
          tenantId: data.tenantId,
          facilityId: data.facilityId,
          facilityName: data.facilityName,
          providerId: data.providerId,
          evidenceRecordId: data.evidenceRecordId,
          blobHash: data.blobHash,
          fileName: data.fileName,
          mimeType: data.mimeType,
        });
      }
    );
    console.log(`[AUDIT-WORKER] Completed job ${jobId}`);
  } catch (err) {
    console.error(`[AUDIT-WORKER] Failed job ${jobId}:`, err);
  } finally {
    busy = false;
  }
}

export function startAuditWorker() {
  console.log('[AUDIT-WORKER] Worker started, polling every', POLL_MS, 'ms');
  setInterval(processPendingAudits, POLL_MS);
}
