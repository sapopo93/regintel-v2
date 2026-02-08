/**
 * Base Validation Rule Interface
 *
 * All validation rules must implement this interface.
 * Rules are applied in order of priority (CRITICAL first).
 */

/**
 * Rule severity levels
 * CRITICAL: Must pass or fallback is used immediately
 * HIGH: Should pass, multiple failures trigger fallback
 * MEDIUM: Advisory, logged but doesn't trigger fallback
 * LOW: Informational only
 */
export type RuleSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Rule categories for grouping
 */
export type RuleCategory =
  | 'hallucination'
  | 'confidence'
  | 'type_safety'
  | 'compliance'
  | 'content';

/**
 * Result of applying a single rule
 */
export interface RuleResult {
  ruleName: string;
  passed: boolean;
  severity: RuleSeverity;
  category: RuleCategory;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Context provided to rules during validation
 */
export interface ValidationContext {
  /** Type of AI output being validated */
  outputType: 'evidence-analysis' | 'policy-generation' | 'mock-insight';
  /** Tenant ID for logging */
  tenantId: string;
  /** Known valid regulation references */
  validRegulations: Set<string>;
  /** Confidence threshold for this validation */
  confidenceThreshold: number;
  /** Additional context-specific data */
  metadata?: Record<string, unknown>;
}

/**
 * Base interface for all validation rules
 */
export interface ValidationRule<T = unknown> {
  /** Unique rule identifier */
  name: string;

  /** Human-readable description */
  description: string;

  /** Rule severity */
  severity: RuleSeverity;

  /** Rule category */
  category: RuleCategory;

  /** Types of output this rule applies to */
  appliesTo: Array<'evidence-analysis' | 'policy-generation' | 'mock-insight'>;

  /**
   * Validate the output
   * @param output - The AI output to validate
   * @param context - Validation context
   * @returns Rule result
   */
  validate(output: T, context: ValidationContext): RuleResult;
}

/**
 * Create a rule result helper
 */
export function createRuleResult(
  rule: Pick<ValidationRule, 'name' | 'severity' | 'category'>,
  passed: boolean,
  message?: string,
  details?: Record<string, unknown>
): RuleResult {
  return {
    ruleName: rule.name,
    passed,
    severity: rule.severity,
    category: rule.category,
    message,
    details,
  };
}

/**
 * Check if a rule applies to a given output type
 */
export function ruleAppliesTo(
  rule: ValidationRule,
  outputType: ValidationContext['outputType']
): boolean {
  return rule.appliesTo.includes(outputType);
}
