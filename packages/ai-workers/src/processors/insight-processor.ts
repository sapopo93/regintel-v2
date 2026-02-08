/**
 * Insight Processor
 *
 * Orchestrates AI-powered mock inspection insights with validation.
 */

import { GeminiClient, getGeminiClient, isGeminiConfigured } from '../gemini-client';
import {
  buildMockInsightPrompt,
  MOCK_INSIGHT_SCHEMA,
  type MockInsightInput,
} from '../prompt-templates/mock-insight.prompt';
import { sanitizeInput } from '../containment/input-sanitizer';
import { checkInsightBounds } from '../containment/output-bounds-checker';
import {
  ValidationEngine,
  type MockInsightOutput,
  getFallbackOutput,
} from '@regintel/ai-validation';

/**
 * Insight processing result
 */
export interface InsightProcessingResult {
  /** Generated insights (may be fallback) */
  insights: MockInsightOutput;

  /** Whether fallback was used */
  isFallback: boolean;

  /** Fallback reason if applicable */
  fallbackReason?: string;

  /** Validation report */
  validationReport: {
    passed: boolean;
    usedFallback: boolean;
    rulesApplied: string[];
    rulesFailed: string[];
  };

  /** Processing metadata */
  metadata: {
    processingTimeMs: number;
    modelId?: string;
    boundsFixesApplied: string[];
  };
}

/**
 * Generate mock inspection insights
 */
export async function generateInsights(
  input: MockInsightInput,
  tenantId: string,
  options: {
    client?: GeminiClient;
    validationEngine?: ValidationEngine;
    validRegulations?: Set<string>;
  } = {}
): Promise<InsightProcessingResult> {
  const startTime = Date.now();
  const client = options.client || getGeminiClient();
  const validationEngine = options.validationEngine || new ValidationEngine();
  const validRegulations = options.validRegulations ?? new Set();

  // Check if Gemini is configured
  if (!isGeminiConfigured()) {
    return createFallbackResult(
      tenantId,
      'AI service not configured',
      Date.now() - startTime
    );
  }

  // Sanitize inputs
  const safeInput: MockInsightInput = {
    ...input,
    topicId: sanitizeInput(input.topicId, { maxLength: 100 }).text,
    topicTitle: sanitizeInput(input.topicTitle, { maxLength: 200 }).text,
    regulationSectionId: sanitizeInput(input.regulationSectionId, { maxLength: 50 }).text,
    question: sanitizeInput(input.question, { maxLength: 2000 }).text,
    answer: sanitizeInput(input.answer, { maxLength: 10000 }).text,
    previousExchanges: input.previousExchanges?.map((ex) => ({
      question: sanitizeInput(ex.question, { maxLength: 2000 }).text,
      answer: sanitizeInput(ex.answer, { maxLength: 5000 }).text,
    })),
    evidenceContext: input.evidenceContext?.map((e) => ({
      ...e,
      fileName: sanitizeInput(e.fileName, { maxLength: 255 }).text,
      summary: e.summary ? sanitizeInput(e.summary, { maxLength: 500 }).text : undefined,
    })),
  };

  // Build prompt
  const prompt = buildMockInsightPrompt(safeInput);

  try {
    // Call Gemini
    const response = await client.generateJSON<MockInsightOutput>(
      prompt,
      MOCK_INSIGHT_SCHEMA
    );

    // Check bounds
    const boundsCheck = checkInsightBounds(response.data);
    const output = boundsCheck.fixedOutput
      ? (boundsCheck.fixedOutput as MockInsightOutput)
      : response.data;

    // Validate with engine
    const validationResult = validationEngine.validateWithFallback(
      output,
      'mock-insight',
      { tenantId, validRegulations }
    );

    return {
      insights: validationResult.output,
      isFallback: validationResult.isFallback,
      fallbackReason: validationResult.fallbackReason,
      validationReport: {
        passed: !validationResult.isFallback,
        usedFallback: validationResult.isFallback,
        rulesApplied: [],
        rulesFailed: validationResult.failedRules || [],
      },
      metadata: {
        processingTimeMs: Date.now() - startTime,
        modelId: client.getModelId(),
        boundsFixesApplied: boundsCheck.fixes,
      },
    };
  } catch (error) {
    console.error('[InsightProcessor] Error:', error);

    return createFallbackResult(
      tenantId,
      error instanceof Error ? error.message : 'Unknown error',
      Date.now() - startTime
    );
  }
}

/**
 * Create fallback result
 */
function createFallbackResult(
  tenantId: string,
  reason: string,
  processingTimeMs: number
): InsightProcessingResult {
  const fallback = getFallbackOutput('mock-insight', {
    tenantId,
    reason,
    failedRules: ['processing-error'],
  }) as MockInsightOutput;

  return {
    insights: fallback,
    isFallback: true,
    fallbackReason: reason,
    validationReport: {
      passed: false,
      usedFallback: true,
      rulesApplied: [],
      rulesFailed: ['processing-error'],
    },
    metadata: {
      processingTimeMs,
      boundsFixesApplied: [],
    },
  };
}

/**
 * Generate follow-up question based on previous exchange
 */
export async function generateFollowUp(
  sessionContext: {
    topicId: string;
    topicTitle: string;
    regulationSectionId: string;
    previousExchanges: Array<{ question: string; answer: string }>;
    evidenceContext?: MockInsightInput['evidenceContext'];
    serviceType?: string;
  },
  tenantId: string,
  options: {
    client?: GeminiClient;
    validationEngine?: ValidationEngine;
  } = {}
): Promise<{ followUpQuestion?: string; isFallback: boolean }> {
  // Use the last exchange to generate insights which include suggested follow-up
  const lastExchange = sessionContext.previousExchanges[sessionContext.previousExchanges.length - 1];

  if (!lastExchange) {
    return { followUpQuestion: undefined, isFallback: false };
  }

  const result = await generateInsights(
    {
      ...sessionContext,
      question: lastExchange.question,
      answer: lastExchange.answer,
      previousExchanges: sessionContext.previousExchanges.slice(0, -1),
    },
    tenantId,
    options
  );

  return {
    followUpQuestion: result.insights.suggestedFollowUp,
    isFallback: result.isFallback,
  };
}
