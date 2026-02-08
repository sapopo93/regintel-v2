/**
 * AI Mock Insight Worker
 *
 * Generates advisory insights for mock inspections.
 */

import { Worker, type Job } from 'bullmq';
import {
  QUEUE_NAMES,
  createWorkerConnection,
  type AIInsightJobData,
  type AIInsightJobResult,
} from '@regintel/queue';
import { generateInsights } from '@regintel/ai-workers';
import { config } from '../config';
import { loadValidRegulations } from '../integrations/regulations';

async function processAIInsightJob(
  job: Job<AIInsightJobData>
): Promise<AIInsightJobResult> {
  const {
    sessionId,
    topicId,
    topicTitle,
    regulationSectionId,
    question,
    answer,
    previousExchanges,
    evidenceContext,
    serviceType,
  } = job.data;

  const result = await generateInsights(
    {
      topicId,
      topicTitle: topicTitle || topicId,
      regulationSectionId: regulationSectionId || 'Reg 12(2)(a)',
      question,
      answer,
      previousExchanges,
      evidenceContext,
      serviceType,
    },
    job.data.tenantId,
    {
      validRegulations: await loadValidRegulations(job.data.tenantId),
    }
  );

  return {
    sessionId,
    insights: result.insights.insights || [],
    suggestedFollowUp: result.insights.suggestedFollowUp,
    riskIndicators: result.insights.riskIndicators || [],
    validationReport: {
      passed: result.validationReport.passed,
      usedFallback: result.validationReport.usedFallback,
      rulesApplied: result.validationReport.rulesApplied,
      rulesFailed: result.validationReport.rulesFailed,
    },
  };
}

/**
 * Create and start AI insight worker
 */
export function createAIInsightWorker(): Worker<AIInsightJobData, AIInsightJobResult> {
  const connection = createWorkerConnection(QUEUE_NAMES.AI_INSIGHT);

  const worker = new Worker<AIInsightJobData, AIInsightJobResult>(
    QUEUE_NAMES.AI_INSIGHT,
    processAIInsightJob,
    {
      connection,
      concurrency: config.worker.concurrency.aiInsight,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[AI Insight] Job ${job.id} completed`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[AI Insight] Job ${job?.id} failed:`, error.message);
  });

  return worker;
}
