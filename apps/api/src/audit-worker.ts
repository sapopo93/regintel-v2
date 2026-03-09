import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
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
  storagePath?: string;
  fileName: string;
  mimeType: string;
  evidenceType?: string;
}

const POLL_MS = 2000;
const BUSY_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
let busy = false;
let busySince: number | null = null;

async function processPendingAudits() {
  if (busy) {
    if (busySince && Date.now() - busySince > BUSY_TIMEOUT_MS) {
      console.warn('[AUDIT-WORKER] Busy flag stuck for >3 minutes, force-resetting');
      busy = false;
      busySince = null;
    } else {
      return;
    }
  }

  // DB-first: find evidence records that have a PENDING document_audit row.
  // This survives API restarts unlike the in-memory queue.
  let pendingRows: Array<{
    evidence_record_id: string;
    tenant_id: string;
    facility_id: string;
    provider_id: string;
    facility_name: string;
    blob_hash: string;
    file_name: string;
    mime_type: string;
    evidence_type: string | null;
  }> = [];

  try {
    pendingRows = await (prisma as any).$queryRaw`
      SELECT
        da.evidence_record_id,
        da.tenant_id,
        da.facility_id,
        da.provider_id,
        COALESCE(f.facility_name, da.facility_id) AS facility_name,
        da.original_file_name  AS file_name,
        da.document_type       AS evidence_type,
        er.blob_hash           AS blob_hash,
        er.mime_type            AS mime_type
      FROM document_audits da
      JOIN evidence_records_v2 er ON er.id = da.evidence_record_id
      LEFT JOIN facilities f ON f.id = da.facility_id AND f.tenant_id = da.tenant_id
      WHERE da.status = 'PENDING'
      ORDER BY da.created_at ASC
      LIMIT 3
    `;
  } catch (err) {
    console.error('[AUDIT-WORKER] DB query failed:', err);
    return;
  }

  if (pendingRows.length === 0) return;

  busy = true;
  busySince = Date.now();
  const row = pendingRows[0];
  const jobId = row.evidence_record_id;
  console.log(`[AUDIT-WORKER] Processing evidence record ${jobId} (${row.file_name})`);

  try {
    await runDocumentAuditForEvidence({
      tenantId: row.tenant_id,
      facilityId: row.facility_id,
      facilityName: row.facility_name,
      providerId: row.provider_id,
      evidenceRecordId: row.evidence_record_id,
      blobHash: row.blob_hash,
      storagePath: undefined,
      fileName: row.file_name,
      mimeType: row.mime_type,
      evidenceType: row.evidence_type ?? undefined,
    });
    console.log(`[AUDIT-WORKER] Completed ${jobId}`);
  } catch (err) {
    console.error(`[AUDIT-WORKER] Failed ${jobId}:`, err);
  } finally {
    busy = false;
    busySince = null;
  }
}

let _timer: ReturnType<typeof setInterval> | null = null;

export function stopAuditWorker(): void {
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
    console.log('[AUDIT-WORKER] Worker stopped');
  }
}

export function startAuditWorker() {
  if (_timer) {
    console.log('[AUDIT-WORKER] Already running, skipping duplicate start');
    return;
  }
  console.log('[AUDIT-WORKER] Worker started, polling every', POLL_MS, 'ms');
  _timer = setInterval(processPendingAudits, POLL_MS);
}
