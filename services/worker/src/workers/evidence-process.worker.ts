/**
 * Evidence Process Worker
 *
 * Processes uploaded evidence files for OCR and text extraction.
 */

import { Worker, type Job } from 'bullmq';
import {
  QUEUE_NAMES,
  createWorkerConnection,
  type EvidenceProcessJobData,
  type EvidenceProcessJobResult,
  enqueueAIEvidence,
} from '@regintel/queue';
import { extractText } from '../integrations/tesseract';
import { readBlob } from '../integrations/blob-storage';
import { config } from '../config';

const MAX_AI_TEXT_LENGTH = 20000;

/**
 * Process evidence extraction job
 */
async function processEvidence(
  job: Job<EvidenceProcessJobData>
): Promise<EvidenceProcessJobResult> {
  const {
    evidenceRecordId,
    blobHash,
    mimeType,
    fileName,
    evidenceType,
    facilityId,
    providerId,
  } = job.data;
  const startTime = Date.now();

  console.log(`[EvidenceProcess] Processing job ${job.id} for evidence ${evidenceRecordId}`);

  try {
    // Get blob content
    const content = await readBlob(blobHash);

    if (!content) {
      console.error(`[EvidenceProcess] Blob not found: ${blobHash}`);
      return {
        evidenceRecordId,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Extract text based on MIME type
    let extractedText: string | undefined;
    let ocrConfidence: number | undefined;
    let pageCount: number | undefined;

    if (mimeType.startsWith('text/')) {
      // Plain text - just decode
      extractedText = content.toString('utf-8');
    } else if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
      // Use OCR for PDFs and images
      const ocrResult = await extractText(content, mimeType);

      if (ocrResult.success && ocrResult.text) {
        extractedText = ocrResult.text;
        ocrConfidence = ocrResult.confidence;

        // Count pages for PDFs
        if (mimeType === 'application/pdf') {
          const pageBreaks = (extractedText.match(/--- Page Break ---/g) || []).length;
          pageCount = pageBreaks + 1;
        }
      } else if (!ocrResult.success) {
        console.warn(`[EvidenceProcess] OCR failed for ${evidenceRecordId}: ${ocrResult.error}`);
      }
    }

    // Store extracted text
    if (extractedText && config.gemini.enabled) {
      await enqueueAIEvidence({
        tenantId: job.data.tenantId,
        actorId: job.data.actorId,
        evidenceRecordId,
        blobHash,
        evidenceType,
        fileName,
        mimeType,
        extractedText: extractedText.slice(0, MAX_AI_TEXT_LENGTH),
        facilityId,
        providerId,
      });
    }

    const processingTimeMs = Date.now() - startTime;
    console.log(`[EvidenceProcess] Completed ${evidenceRecordId} in ${processingTimeMs}ms`);

    return {
      evidenceRecordId,
      extractedText: extractedText?.slice(0, 1000), // Return truncated for logging
      pageCount,
      ocrConfidence,
      processingTimeMs,
    };
  } catch (error) {
    console.error(`[EvidenceProcess] Error processing ${evidenceRecordId}:`, error);

    return {
      evidenceRecordId,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
/**
 * Create and start evidence process worker
 */
export function createEvidenceProcessWorker(): Worker<EvidenceProcessJobData, EvidenceProcessJobResult> {
  const connection = createWorkerConnection(QUEUE_NAMES.EVIDENCE_PROCESS);

  const worker = new Worker<EvidenceProcessJobData, EvidenceProcessJobResult>(
    QUEUE_NAMES.EVIDENCE_PROCESS,
    processEvidence,
    {
      connection,
      concurrency: config.worker.concurrency.evidenceProcess,
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[EvidenceProcess] Job ${job.id} completed: ${result.processingTimeMs}ms`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[EvidenceProcess] Job ${job?.id} failed:`, error.message);
  });

  return worker;
}
