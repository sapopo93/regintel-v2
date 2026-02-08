/**
 * AI Policy Generation Worker
 *
 * Generates draft policies using Gemini with validation.
 */

import { Worker, type Job } from 'bullmq';
import {
  QUEUE_NAMES,
  createWorkerConnection,
  type AIPolicyJobData,
  type AIPolicyJobResult,
} from '@regintel/queue';
import { generatePolicy } from '@regintel/ai-workers';
import { config } from '../config';
import { loadValidRegulations } from '../integrations/regulations';

async function processAIPolicyJob(
  job: Job<AIPolicyJobData>
): Promise<AIPolicyJobResult> {
  const { policyType, regulationIds, existingPolicyText, context } = job.data;

  const result = await generatePolicy(
    {
      policyType,
      regulationIds,
      existingPolicyText,
      serviceType: context?.serviceType,
      capacity: context?.capacity,
      specialConditions: context?.specialConditions,
    },
    job.data.tenantId,
    {
      validRegulations: await loadValidRegulations(job.data.tenantId),
    }
  );

  return {
    draftPolicy: result.policy.draftPolicy,
    sections: result.policy.sections || [],
    confidence: result.policy.confidence || 0,
    validationReport: {
      passed: result.validationReport.passed,
      usedFallback: result.validationReport.usedFallback,
      rulesApplied: result.validationReport.rulesApplied,
      rulesFailed: result.validationReport.rulesFailed,
    },
  };
}

/**
 * Create and start AI policy generation worker
 */
export function createAIPolicyWorker(): Worker<AIPolicyJobData, AIPolicyJobResult> {
  const connection = createWorkerConnection(QUEUE_NAMES.AI_POLICY);

  const worker = new Worker<AIPolicyJobData, AIPolicyJobResult>(
    QUEUE_NAMES.AI_POLICY,
    processAIPolicyJob,
    {
      connection,
      concurrency: config.worker.concurrency.aiPolicy,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[AI Policy] Job ${job.id} completed`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[AI Policy] Job ${job?.id} failed:`, error.message);
  });

  return worker;
}
