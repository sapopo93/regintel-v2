/**
 * Template Fallback System
 *
 * Provides deterministic fallback outputs when AI validation fails.
 * These templates are safe, conservative outputs that can be used
 * when AI output cannot be trusted.
 */

import { EvidenceType } from '@regintel/domain/evidence-types';
import type { EvidenceAnalysisOutput } from './rules/evidence-rules';
import type { PolicyGenerationOutput } from './rules/policy-rules';
import type { MockInsightOutput } from './rules/insight-rules';

/**
 * Output type union
 */
export type AIOutput = EvidenceAnalysisOutput | PolicyGenerationOutput | MockInsightOutput;

/**
 * Fallback context provided to template generators
 */
export interface FallbackContext {
  tenantId: string;
  reason: string;
  failedRules: string[];
  inputSummary?: string;
}

/**
 * Evidence analysis fallback template
 */
export function getEvidenceFallback(context: FallbackContext): EvidenceAnalysisOutput {
  return {
    suggestedType: EvidenceType.OTHER,
    suggestedTypeConfidence: 0,
    relevantRegulations: [],
    keyEntities: [],
    summary: `Unable to automatically analyze this document. Manual review required. (Reason: ${context.reason})`,
  };
}

/**
 * Policy generation fallback template
 */
export function getPolicyFallback(context: FallbackContext): PolicyGenerationOutput {
  return {
    draftPolicy: undefined,
    sections: [
      {
        title: 'Manual Review Required',
        content: `Automatic policy generation was not completed. Please draft this policy manually or consult with a compliance specialist. (Reason: ${context.reason})`,
        regulationRef: undefined,
      },
    ],
    confidence: 0,
  };
}

/**
 * Mock insight fallback template
 */
export function getInsightFallback(context: FallbackContext): MockInsightOutput {
  return {
    insights: [
      {
        type: 'suggestion',
        content: 'Unable to generate automated insights. Please review your response manually against the relevant CQC regulations.',
        confidence: 0,
        regulationRef: undefined,
      },
    ],
    suggestedFollowUp: 'Consider consulting your compliance documentation for guidance on this topic.',
    riskIndicators: [],
  };
}

/**
 * Get fallback output for a specific type
 */
export function getFallbackOutput(
  outputType: 'evidence-analysis' | 'policy-generation' | 'mock-insight',
  context: FallbackContext
): AIOutput {
  switch (outputType) {
    case 'evidence-analysis':
      return getEvidenceFallback(context);
    case 'policy-generation':
      return getPolicyFallback(context);
    case 'mock-insight':
      return getInsightFallback(context);
    default:
      throw new Error(`Unknown output type: ${outputType}`);
  }
}

/**
 * Check if output is a fallback
 */
export function isFallbackOutput(output: AIOutput): boolean {
  // Evidence analysis fallback check
  if ('suggestedType' in output) {
    return (
      output.suggestedType === EvidenceType.OTHER &&
      output.suggestedTypeConfidence === 0 &&
      output.relevantRegulations?.length === 0
    );
  }

  // Policy fallback check
  if ('draftPolicy' in output) {
    return (
      output.confidence === 0 &&
      output.sections?.length === 1 &&
      output.sections[0]?.title === 'Manual Review Required'
    );
  }

  // Insight fallback check
  if ('insights' in output) {
    return (
      output.insights?.length === 1 &&
      output.insights[0]?.confidence === 0 &&
      output.insights[0]?.content.includes('Unable to generate automated insights')
    );
  }

  return false;
}

/**
 * Wrap output with fallback metadata
 */
export interface FallbackWrappedOutput<T extends AIOutput> {
  output: T;
  isFallback: boolean;
  fallbackReason?: string;
  failedRules?: string[];
}

export function wrapWithFallbackMetadata<T extends AIOutput>(
  output: T,
  fallbackContext?: FallbackContext
): FallbackWrappedOutput<T> {
  if (!fallbackContext) {
    return {
      output,
      isFallback: false,
    };
  }

  return {
    output,
    isFallback: true,
    fallbackReason: fallbackContext.reason,
    failedRules: fallbackContext.failedRules,
  };
}
