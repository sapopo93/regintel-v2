/**
 * Validation Rules Index
 *
 * Exports all validation rules and rule utilities.
 */

export * from './base-rule';
export * from './evidence-rules';
export * from './policy-rules';
export * from './insight-rules';

import type { ValidationRule, ValidationContext } from './base-rule';
import { EVIDENCE_RULES, type EvidenceAnalysisOutput } from './evidence-rules';
import { POLICY_RULES, type PolicyGenerationOutput } from './policy-rules';
import { INSIGHT_RULES, type MockInsightOutput } from './insight-rules';

/**
 * All rules grouped by output type
 */
export const ALL_RULES = {
  'evidence-analysis': EVIDENCE_RULES,
  'policy-generation': POLICY_RULES,
  'mock-insight': INSIGHT_RULES,
} as const;

/**
 * Get rules for a specific output type
 */
export function getRulesForType(
  outputType: ValidationContext['outputType']
): ValidationRule[] {
  return ALL_RULES[outputType] || [];
}

/**
 * Get all rules (flattened)
 */
export function getAllRules(): ValidationRule[] {
  return [...EVIDENCE_RULES, ...POLICY_RULES, ...INSIGHT_RULES];
}

/**
 * Get critical rules only
 */
export function getCriticalRules(): ValidationRule[] {
  return getAllRules().filter((rule) => rule.severity === 'CRITICAL');
}
