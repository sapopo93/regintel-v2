/**
 * @regintel/ai-workers
 *
 * AI-powered workers for RegIntel v2 using Google Gemini.
 *
 * Features:
 * - Evidence analysis with type classification
 * - Policy draft generation
 * - Mock inspection insights (advisory only)
 * - Input sanitization (prompt injection prevention)
 * - Output validation with fallbacks
 *
 * @example
 * ```typescript
 * import { processEvidence, generatePolicy, generateInsights } from '@regintel/ai-workers';
 *
 * // Analyze uploaded evidence
 * const analysis = await processEvidence({
 *   extractedText: 'Training record content...',
 *   fileName: 'training-records.pdf',
 *   mimeType: 'application/pdf',
 * }, 'tenant-123');
 *
 * if (!analysis.isFallback) {
 *   console.log('Suggested type:', analysis.analysis.suggestedType);
 * }
 * ```
 */

// Gemini Client
export { GeminiClient, getGeminiClient, isGeminiConfigured } from './gemini-client';
export type { GeminiConfig, GeminiResponse } from './gemini-client';

// Processors
export {
  processEvidence,
  processEvidenceBatch,
  generatePolicy,
  updatePolicy,
  generateInsights,
  generateFollowUp,
} from './processors';
export type {
  EvidenceProcessingResult,
  PolicyProcessingResult,
  InsightProcessingResult,
} from './processors';

// Prompt Templates
export {
  buildEvidenceAnalysisPrompt,
  buildPolicyGenerationPrompt,
  buildMockInsightPrompt,
  EVIDENCE_ANALYSIS_SCHEMA,
  POLICY_GENERATION_SCHEMA,
  MOCK_INSIGHT_SCHEMA,
} from './prompt-templates';
export type {
  EvidenceAnalysisInput,
  PolicyGenerationInput,
  MockInsightInput,
} from './prompt-templates';

// Containment
export {
  sanitizeInput,
  sanitizeFileName,
  sanitizeExtractedText,
  createSafeContext,
  checkEvidenceAnalysisBounds,
  checkPolicyGenerationBounds,
  checkInsightBounds,
  checkNumericBounds,
  checkStringBounds,
  checkArrayBounds,
} from './containment';
export type { SanitizationResult, BoundsCheckResult } from './containment';
