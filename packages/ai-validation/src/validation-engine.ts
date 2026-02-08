/**
 * Validation Engine
 *
 * Core engine for validating AI outputs against rules.
 * Orchestrates rule execution, confidence scoring, and fallback selection.
 */

import type {
  ValidationRule,
  ValidationContext,
  RuleResult,
  RuleSeverity,
} from './rules/base-rule';
import { ruleAppliesTo, getRulesForType, getAllRules } from './rules';
import { calculateConfidence, type ConfidenceScore } from './confidence-scoring';
import {
  getFallbackOutput,
  wrapWithFallbackMetadata,
  type AIOutput,
  type FallbackContext,
  type FallbackWrappedOutput,
} from './template-fallback';

/**
 * Validation report summarizing all rule results
 */
export interface ValidationReport {
  /** Overall pass/fail */
  passed: boolean;

  /** Whether fallback should be used */
  useFallback: boolean;

  /** Confidence score */
  confidence: ConfidenceScore;

  /** Individual rule results */
  results: RuleResult[];

  /** Summary counts */
  summary: {
    total: number;
    passed: number;
    failed: number;
    bySeverity: Record<RuleSeverity, { passed: number; failed: number }>;
  };

  /** Failed rules for debugging */
  failedRules: string[];

  /** Timestamp */
  validatedAt: string;
}

/**
 * Validation engine configuration
 */
export interface ValidationEngineConfig {
  /** Confidence threshold (default from env or 0.7) */
  confidenceThreshold: number;

  /** Maximum critical failures before fallback (default: 0) */
  maxCriticalFailures: number;

  /** Maximum high severity failures before fallback (default: 2) */
  maxHighFailures: number;

  /** Custom rules to add */
  customRules?: ValidationRule[];
}

const DEFAULT_CONFIG: ValidationEngineConfig = {
  confidenceThreshold: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD || '0.7'),
  maxCriticalFailures: 0,
  maxHighFailures: 2,
};

/**
 * Main validation engine class
 */
export class ValidationEngine {
  private config: ValidationEngineConfig;
  private rules: ValidationRule[];

  constructor(config: Partial<ValidationEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rules = [...getAllRules(), ...(this.config.customRules || [])];
  }

  /**
   * Validate an AI output
   */
  validate<T extends AIOutput>(
    output: T,
    outputType: ValidationContext['outputType'],
    context: Omit<ValidationContext, 'outputType' | 'confidenceThreshold'>
  ): ValidationReport {
    const fullContext: ValidationContext = {
      ...context,
      outputType,
      confidenceThreshold: this.config.confidenceThreshold,
    };

    // Get applicable rules
    const applicableRules = this.rules.filter((rule) =>
      ruleAppliesTo(rule, outputType)
    );

    // Execute all rules
    const results: RuleResult[] = [];
    for (const rule of applicableRules) {
      try {
        const result = rule.validate(output, fullContext);
        results.push(result);
      } catch (error) {
        // Rule execution error counts as failure
        results.push({
          ruleName: rule.name,
          passed: false,
          severity: rule.severity,
          category: rule.category,
          message: `Rule execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

    // Calculate summary
    const summary = this.calculateSummary(results);

    // Get model confidence from output
    const modelConfidence = this.extractModelConfidence(output);

    // Calculate confidence score
    const confidence = calculateConfidence(
      modelConfidence,
      results,
      this.extractContentForQuality(output),
      { threshold: this.config.confidenceThreshold }
    );

    // Determine if fallback is needed
    const useFallback = this.shouldUseFallback(summary, confidence);

    // Overall pass: no critical failures and meets threshold
    const passed = !useFallback && confidence.meetsThreshold;

    return {
      passed,
      useFallback,
      confidence,
      results,
      summary,
      failedRules: results.filter((r) => !r.passed).map((r) => r.ruleName),
      validatedAt: new Date().toISOString(),
    };
  }

  /**
   * Validate and get output with fallback if needed
   */
  validateWithFallback<T extends AIOutput>(
    output: T,
    outputType: ValidationContext['outputType'],
    context: Omit<ValidationContext, 'outputType' | 'confidenceThreshold'>
  ): FallbackWrappedOutput<T> {
    const report = this.validate(output, outputType, context);

    if (report.useFallback) {
      const fallbackContext: FallbackContext = {
        tenantId: context.tenantId,
        reason: this.getFallbackReason(report),
        failedRules: report.failedRules,
      };

      const fallback = getFallbackOutput(outputType, fallbackContext) as T;
      return wrapWithFallbackMetadata(fallback, fallbackContext);
    }

    return wrapWithFallbackMetadata(output);
  }

  /**
   * Calculate summary from results
   */
  private calculateSummary(results: RuleResult[]): ValidationReport['summary'] {
    const bySeverity: Record<RuleSeverity, { passed: number; failed: number }> = {
      CRITICAL: { passed: 0, failed: 0 },
      HIGH: { passed: 0, failed: 0 },
      MEDIUM: { passed: 0, failed: 0 },
      LOW: { passed: 0, failed: 0 },
    };

    let passed = 0;
    let failed = 0;

    for (const result of results) {
      if (result.passed) {
        passed++;
        bySeverity[result.severity].passed++;
      } else {
        failed++;
        bySeverity[result.severity].failed++;
      }
    }

    return {
      total: results.length,
      passed,
      failed,
      bySeverity,
    };
  }

  /**
   * Determine if fallback should be used
   */
  private shouldUseFallback(
    summary: ValidationReport['summary'],
    confidence: ConfidenceScore
  ): boolean {
    // Any critical failure triggers fallback
    if (summary.bySeverity.CRITICAL.failed > this.config.maxCriticalFailures) {
      return true;
    }

    // Too many high severity failures trigger fallback
    if (summary.bySeverity.HIGH.failed > this.config.maxHighFailures) {
      return true;
    }

    // Low confidence triggers fallback
    if (!confidence.meetsThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Get reason for fallback
   */
  private getFallbackReason(report: ValidationReport): string {
    if (report.summary.bySeverity.CRITICAL.failed > 0) {
      return 'Critical validation failure';
    }

    if (report.summary.bySeverity.HIGH.failed > this.config.maxHighFailures) {
      return 'Multiple high-severity validation failures';
    }

    if (!report.confidence.meetsThreshold) {
      return `Low confidence (${report.confidence.overall.toFixed(2)} < ${report.confidence.threshold})`;
    }

    return 'Validation failed';
  }

  /**
   * Extract model confidence from output
   */
  private extractModelConfidence(output: AIOutput): number {
    if ('suggestedTypeConfidence' in output) {
      return output.suggestedTypeConfidence ?? 0.5;
    }
    if ('confidence' in output) {
      return output.confidence ?? 0.5;
    }
    // Calculate average from insights
    if ('insights' in output && output.insights) {
      const confidences = output.insights
        .map((i) => i.confidence)
        .filter((c): c is number => c !== undefined);
      if (confidences.length > 0) {
        return confidences.reduce((a, b) => a + b, 0) / confidences.length;
      }
    }
    return 0.5;
  }

  /**
   * Extract content for quality analysis
   */
  private extractContentForQuality(output: AIOutput): {
    text?: string;
    entities?: Array<{ confidence?: number }>;
    sections?: Array<{ content?: string }>;
  } {
    if ('summary' in output) {
      return {
        text: output.summary,
        entities: 'keyEntities' in output ? output.keyEntities : undefined,
      };
    }
    if ('sections' in output) {
      return {
        sections: output.sections,
        text: output.draftPolicy,
      };
    }
    if ('insights' in output) {
      return {
        text: output.insights?.map((i) => i.content).join(' '),
      };
    }
    return {};
  }
}

/**
 * Default validation engine instance
 */
export const defaultEngine = new ValidationEngine();

/**
 * Quick validation helper
 */
export function validateAIOutput<T extends AIOutput>(
  output: T,
  outputType: ValidationContext['outputType'],
  tenantId: string
): ValidationReport {
  return defaultEngine.validate(output, outputType, {
    tenantId,
    validRegulations: new Set(),
  });
}

/**
 * Quick validation with fallback helper
 */
export function validateWithFallback<T extends AIOutput>(
  output: T,
  outputType: ValidationContext['outputType'],
  tenantId: string
): FallbackWrappedOutput<T> {
  return defaultEngine.validateWithFallback(output, outputType, {
    tenantId,
    validRegulations: new Set(),
  });
}
