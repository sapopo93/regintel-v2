/**
 * @regintel/ai-validation
 *
 * AI output validation framework for RegIntel v2.
 *
 * Core principle: AI generates, Rules validate, Engine decides.
 *
 * Features:
 * - Type-safe validation rules
 * - Confidence scoring
 * - Deterministic fallback templates
 * - Zero tolerance for hallucinated regulations
 * - No compliance assertions allowed
 *
 * @example
 * ```typescript
 * import { ValidationEngine, validateWithFallback } from '@regintel/ai-validation';
 *
 * // Validate AI evidence analysis
 * const result = validateWithFallback(
 *   aiOutput,
 *   'evidence-analysis',
 *   'tenant-123'
 * );
 *
 * if (result.isFallback) {
 *   console.log('Using fallback due to:', result.fallbackReason);
 * }
 * ```
 */

// Validation Engine
export {
  ValidationEngine,
  defaultEngine,
  validateAIOutput,
  validateWithFallback,
} from './validation-engine';
export type { ValidationReport, ValidationEngineConfig } from './validation-engine';

// Rules
export * from './rules';
export type { ValidationRule, ValidationContext, RuleResult, RuleSeverity, RuleCategory } from './rules/base-rule';
export type { EvidenceAnalysisOutput } from './rules/evidence-rules';
export type { PolicyGenerationOutput } from './rules/policy-rules';
export type { MockInsightOutput } from './rules/insight-rules';

// Confidence Scoring
export {
  calculateConfidence,
  meetsConfidenceThreshold,
  getConfidenceLevel,
} from './confidence-scoring';
export type { ConfidenceScore, ConfidenceConfig } from './confidence-scoring';

// Fallback Templates
export {
  getFallbackOutput,
  getEvidenceFallback,
  getPolicyFallback,
  getInsightFallback,
  isFallbackOutput,
  wrapWithFallbackMetadata,
} from './template-fallback';
export type { AIOutput, FallbackContext, FallbackWrappedOutput } from './template-fallback';
