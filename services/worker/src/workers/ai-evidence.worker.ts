/**
 * AI Evidence Analysis Worker
 *
 * Runs Gemini evidence analysis with validation and returns structured output.
 */

import { Worker, type Job } from 'bullmq';
import {
  QUEUE_NAMES,
  createWorkerConnection,
  type AIEvidenceJobData,
  type AIEvidenceJobResult,
} from '@regintel/queue';
import { processEvidence } from '@regintel/ai-workers';
import { config } from '../config';
import { loadValidRegulations } from '../integrations/regulations';

async function processAIEvidenceJob(
  job: Job<AIEvidenceJobData>
): Promise<AIEvidenceJobResult> {
  const {
    evidenceRecordId,
    extractedText,
    fileName,
    evidenceType,
    mimeType,
  } = job.data;

  const result = await processEvidence(
    {
      extractedText: extractedText || '',
      fileName,
      mimeType: mimeType || 'application/octet-stream',
      evidenceTypeHint: evidenceType,
    },
    job.data.tenantId,
    {
      validRegulations: await loadValidRegulations(job.data.tenantId),
    }
  );

  return {
    evidenceRecordId,
    suggestedType: result.analysis.suggestedType,
    suggestedTypeConfidence: result.analysis.suggestedTypeConfidence || 0,
    relevantRegulations: result.analysis.relevantRegulations || [],
    keyEntities: result.analysis.keyEntities || [],
    summary: result.analysis.summary,
    validationReport: {
      passed: result.validationReport.passed,
      usedFallback: result.validationReport.usedFallback,
      rulesApplied: result.validationReport.rulesApplied,
      rulesFailed: result.validationReport.rulesFailed,
    },
  };
}

/**
 * Create and start AI evidence analysis worker
 */
export function createAIEvidenceWorker(): Worker<AIEvidenceJobData, AIEvidenceJobResult> {
  const connection = createWorkerConnection(QUEUE_NAMES.AI_EVIDENCE);

  const worker = new Worker<AIEvidenceJobData, AIEvidenceJobResult>(
    QUEUE_NAMES.AI_EVIDENCE,
    processAIEvidenceJob,
    {
      connection,
      concurrency: config.worker.concurrency.aiEvidence,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[AI Evidence] Job ${job.id} completed`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[AI Evidence] Job ${job?.id} failed:`, error.message);
  });

  return worker;
}
