/**
 * Evidence Processor
 *
 * Orchestrates AI-powered evidence analysis with validation.
 */

import { GeminiClient, getGeminiClient, isGeminiConfigured } from '../gemini-client';
import {
  buildEvidenceAnalysisPrompt,
  EVIDENCE_ANALYSIS_SCHEMA,
  type EvidenceAnalysisInput,
} from '../prompt-templates/evidence-analysis.prompt';
import { sanitizeInput, sanitizeExtractedText, createSafeContext } from '../containment/input-sanitizer';
import { checkEvidenceAnalysisBounds } from '../containment/output-bounds-checker';
import {
  ValidationEngine,
  type EvidenceAnalysisOutput,
  type FallbackWrappedOutput,
  getFallbackOutput,
} from '@regintel/ai-validation';

/**
 * Evidence processing result
 */
export interface EvidenceProcessingResult {
  /** Analysis output (may be fallback) */
  analysis: EvidenceAnalysisOutput;

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
    inputTruncated: boolean;
    boundsFixesApplied: string[];
  };
}

/**
 * Process evidence with AI analysis
 */
export async function processEvidence(
  input: EvidenceAnalysisInput,
  tenantId: string,
  options: {
    client?: GeminiClient;
    validationEngine?: ValidationEngine;
    validRegulations?: Set<string>;
  } = {}
): Promise<EvidenceProcessingResult> {
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
  const sanitizedText = sanitizeExtractedText(input.extractedText);
  const sanitizedFileName = sanitizeInput(input.fileName, { maxLength: 255 }).text;
  const inputTruncated = sanitizedText.length < input.extractedText.length;

  const safeInput: EvidenceAnalysisInput = {
    ...input,
    extractedText: sanitizedText,
    fileName: sanitizedFileName,
    context: input.context ? sanitizeInput(input.context, { maxLength: 1000 }).text : undefined,
  };

  // Build prompt
  const prompt = buildEvidenceAnalysisPrompt(safeInput);

  try {
    // Call Gemini
    const response = await client.generateJSON<EvidenceAnalysisOutput>(
      prompt,
      EVIDENCE_ANALYSIS_SCHEMA
    );

    // Check bounds
    const boundsCheck = checkEvidenceAnalysisBounds(response.data);
    const output = boundsCheck.fixedOutput
      ? (boundsCheck.fixedOutput as EvidenceAnalysisOutput)
      : response.data;

    // Validate with engine
    const validationResult = validationEngine.validateWithFallback(
      output,
      'evidence-analysis',
      { tenantId, validRegulations }
    );

    return {
      analysis: validationResult.output,
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
        inputTruncated,
        boundsFixesApplied: boundsCheck.fixes,
      },
    };
  } catch (error) {
    console.error('[EvidenceProcessor] Error:', error);

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
): EvidenceProcessingResult {
  const fallback = getFallbackOutput('evidence-analysis', {
    tenantId,
    reason,
    failedRules: ['processing-error'],
  }) as EvidenceAnalysisOutput;

  return {
    analysis: fallback,
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
      inputTruncated: false,
      boundsFixesApplied: [],
    },
  };
}

/**
 * Batch process multiple evidence items
 */
export async function processEvidenceBatch(
  items: Array<{ id: string; input: EvidenceAnalysisInput }>,
  tenantId: string,
  options: {
    client?: GeminiClient;
    validationEngine?: ValidationEngine;
    concurrency?: number;
  } = {}
): Promise<Map<string, EvidenceProcessingResult>> {
  const results = new Map<string, EvidenceProcessingResult>();
  const concurrency = options.concurrency || 5;

  // Process in batches
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async ({ id, input }) => {
        const result = await processEvidence(input, tenantId, options);
        return { id, result };
      })
    );

    for (const { id, result } of batchResults) {
      results.set(id, result);
    }
  }

  return results;
}
