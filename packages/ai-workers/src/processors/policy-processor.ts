/**
 * Policy Processor
 *
 * Orchestrates AI-powered policy generation with validation.
 */

import { GeminiClient, getGeminiClient, isGeminiConfigured } from '../gemini-client';
import {
  buildPolicyGenerationPrompt,
  POLICY_GENERATION_SCHEMA,
  type PolicyGenerationInput,
} from '../prompt-templates/policy-generation.prompt';
import { sanitizeInput, createSafeContext } from '../containment/input-sanitizer';
import { checkPolicyGenerationBounds } from '../containment/output-bounds-checker';
import {
  ValidationEngine,
  type PolicyGenerationOutput,
  getFallbackOutput,
} from '@regintel/ai-validation';

/**
 * Policy processing result
 */
export interface PolicyProcessingResult {
  /** Generated policy (may be fallback) */
  policy: PolicyGenerationOutput;

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
 * Generate policy with AI
 */
export async function generatePolicy(
  input: PolicyGenerationInput,
  tenantId: string,
  options: {
    client?: GeminiClient;
    validationEngine?: ValidationEngine;
    validRegulations?: Set<string>;
  } = {}
): Promise<PolicyProcessingResult> {
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
  const safeInput: PolicyGenerationInput = {
    ...input,
    policyType: sanitizeInput(input.policyType, { maxLength: 200 }).text,
    regulationIds: input.regulationIds.map((id) => sanitizeInput(id, { maxLength: 50 }).text),
    existingPolicyText: input.existingPolicyText
      ? sanitizeInput(input.existingPolicyText, { maxLength: 20000 }).text
      : undefined,
    specialConditions: input.specialConditions?.map(
      (c) => sanitizeInput(c, { maxLength: 500 }).text
    ),
    providerName: input.providerName
      ? sanitizeInput(input.providerName, { maxLength: 200 }).text
      : undefined,
  };

  // Build prompt
  const prompt = buildPolicyGenerationPrompt(safeInput);

  try {
    // Call Gemini
    const response = await client.generateJSON<PolicyGenerationOutput>(
      prompt,
      POLICY_GENERATION_SCHEMA
    );

    // Check bounds
    const boundsCheck = checkPolicyGenerationBounds(response.data);
    const output = boundsCheck.fixedOutput
      ? (boundsCheck.fixedOutput as PolicyGenerationOutput)
      : response.data;

    // Validate with engine
    const validationResult = validationEngine.validateWithFallback(
      output,
      'policy-generation',
      { tenantId, validRegulations }
    );

    return {
      policy: validationResult.output,
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
    console.error('[PolicyProcessor] Error:', error);

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
): PolicyProcessingResult {
  const fallback = getFallbackOutput('policy-generation', {
    tenantId,
    reason,
    failedRules: ['processing-error'],
  }) as PolicyGenerationOutput;

  return {
    policy: fallback,
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
 * Update existing policy with AI assistance
 */
export async function updatePolicy(
  existingPolicy: string,
  updateRequest: {
    policyType: string;
    regulationIds: string[];
    updateInstructions?: string;
    serviceType?: string;
  },
  tenantId: string,
  options: {
    client?: GeminiClient;
    validationEngine?: ValidationEngine;
  } = {}
): Promise<PolicyProcessingResult> {
  return generatePolicy(
    {
      ...updateRequest,
      existingPolicyText: existingPolicy,
    },
    tenantId,
    options
  );
}
