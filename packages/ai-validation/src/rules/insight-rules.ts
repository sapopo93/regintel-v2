/**
 * Mock Insight Validation Rules
 *
 * Rules for validating AI-generated mock inspection insights.
 * These insights are ADVISORY ONLY and must not make compliance determinations.
 */

import type { ValidationRule, ValidationContext, RuleResult } from './base-rule';
import { createRuleResult } from './base-rule';

/**
 * Mock insight output structure
 */
export interface MockInsightOutput {
  insights?: Array<{
    type: 'strength' | 'gap' | 'suggestion' | 'follow_up';
    content: string;
    confidence?: number;
    regulationRef?: string;
  }>;
  suggestedFollowUp?: string;
  riskIndicators?: Array<{
    indicator: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
}

/**
 * CRITICAL: No Rating Predictions Rule
 *
 * AI cannot predict inspection ratings (Good, Requires Improvement, etc.)
 */
export const noRatingPredictionsRule: ValidationRule<MockInsightOutput> = {
  name: 'no-rating-predictions',
  description: 'AI cannot predict CQC ratings',
  severity: 'CRITICAL',
  category: 'compliance',
  appliesTo: ['mock-insight'],

  validate(output, context): RuleResult {
    const allText = [
      output.suggestedFollowUp || '',
      ...(output.insights?.map((i) => i.content) || []),
      ...(output.riskIndicators?.map((r) => r.indicator) || []),
    ].join(' ');

    const ratingPatterns = [
      /\bwill (?:be )?rated\b/i,
      /\bwould (?:be )?rated\b/i,
      /\bexpect(?:ing|ed)? (?:a )?(?:good|outstanding|inadequate|requires improvement) rating\b/i,
      /\b(?:likely|probably) (?:to )?(?:receive|get) (?:a )?(?:good|outstanding|inadequate) rating\b/i,
      /\byou (?:will|would|should) (?:receive|get) (?:a )?(?:good|outstanding) rating\b/i,
      /\bguarantee(?:s|d)? (?:a )?(?:good|outstanding) rating\b/i,
      /\brating prediction\b/i,
      /\bpredicted rating\b/i,
    ];

    const matches: string[] = [];
    for (const pattern of ratingPatterns) {
      const match = allText.match(pattern);
      if (match) {
        matches.push(match[0]);
      }
    }

    if (matches.length > 0) {
      return createRuleResult(
        this,
        false,
        `Forbidden rating predictions: ${matches.join(', ')}`,
        { forbiddenPhrases: matches }
      );
    }

    return createRuleResult(this, true, 'No rating predictions found');
  },
};

/**
 * CRITICAL: No Inspection Guarantees Rule
 *
 * AI cannot guarantee inspection outcomes.
 */
export const noInspectionGuaranteesRule: ValidationRule<MockInsightOutput> = {
  name: 'no-inspection-guarantees',
  description: 'AI cannot guarantee inspection outcomes',
  severity: 'CRITICAL',
  category: 'compliance',
  appliesTo: ['mock-insight'],

  validate(output, context): RuleResult {
    const allText = [
      output.suggestedFollowUp || '',
      ...(output.insights?.map((i) => i.content) || []),
    ].join(' ');

    const guaranteePatterns = [
      /\bwill pass\b/i,
      /\bwill fail\b/i,
      /\bguarantee(?:s|d)?\b/i,
      /\bensure(?:s|d)? (?:you )?pass\b/i,
      /\bno (?:chance|way) (?:of|to) fail\b/i,
      /\bwon't fail\b/i,
      /\bimpossible to fail\b/i,
      /\bcertain to pass\b/i,
    ];

    const matches: string[] = [];
    for (const pattern of guaranteePatterns) {
      const match = allText.match(pattern);
      if (match) {
        matches.push(match[0]);
      }
    }

    if (matches.length > 0) {
      return createRuleResult(
        this,
        false,
        `Forbidden inspection guarantees: ${matches.join(', ')}`,
        { forbiddenPhrases: matches }
      );
    }

    return createRuleResult(this, true, 'No inspection guarantees found');
  },
};

/**
 * HIGH: Insight Type Validity Rule
 *
 * Insight types must be valid enum values.
 */
export const insightTypeValidityRule: ValidationRule<MockInsightOutput> = {
  name: 'insight-type-validity',
  description: 'Insight types must be strength, gap, suggestion, or follow_up',
  severity: 'HIGH',
  category: 'type_safety',
  appliesTo: ['mock-insight'],

  validate(output, context): RuleResult {
    const insights = output.insights || [];

    if (insights.length === 0) {
      return createRuleResult(this, true, 'No insights to validate');
    }

    const validTypes = new Set(['strength', 'gap', 'suggestion', 'follow_up']);
    const invalidTypes = insights.filter((i) => !validTypes.has(i.type));

    if (invalidTypes.length > 0) {
      return createRuleResult(
        this,
        false,
        `Invalid insight types: ${invalidTypes.map((i) => i.type).join(', ')}`,
        { invalidTypes: invalidTypes.map((i) => i.type) }
      );
    }

    return createRuleResult(this, true, `All ${insights.length} insight types valid`);
  },
};

/**
 * HIGH: Risk Severity Validity Rule
 *
 * Risk indicator severities must be valid.
 */
export const riskSeverityValidityRule: ValidationRule<MockInsightOutput> = {
  name: 'risk-severity-validity',
  description: 'Risk severities must be LOW, MEDIUM, or HIGH',
  severity: 'HIGH',
  category: 'type_safety',
  appliesTo: ['mock-insight'],

  validate(output, context): RuleResult {
    const indicators = output.riskIndicators || [];

    if (indicators.length === 0) {
      return createRuleResult(this, true, 'No risk indicators to validate');
    }

    const validSeverities = new Set(['LOW', 'MEDIUM', 'HIGH']);
    const invalid = indicators.filter((i) => !validSeverities.has(i.severity));

    if (invalid.length > 0) {
      return createRuleResult(
        this,
        false,
        `Invalid risk severities: ${invalid.map((i) => i.severity).join(', ')}`,
        { invalidSeverities: invalid.map((i) => i.severity) }
      );
    }

    return createRuleResult(this, true, `All ${indicators.length} risk severities valid`);
  },
};

/**
 * MEDIUM: Balanced Insights Rule
 *
 * Insights should include both strengths and gaps/suggestions.
 */
export const balancedInsightsRule: ValidationRule<MockInsightOutput> = {
  name: 'balanced-insights',
  description: 'Insights should include both strengths and areas for improvement',
  severity: 'MEDIUM',
  category: 'content',
  appliesTo: ['mock-insight'],

  validate(output, context): RuleResult {
    const insights = output.insights || [];

    if (insights.length < 2) {
      return createRuleResult(this, true, 'Too few insights to assess balance');
    }

    const strengths = insights.filter((i) => i.type === 'strength');
    const improvements = insights.filter(
      (i) => i.type === 'gap' || i.type === 'suggestion'
    );

    if (strengths.length === 0 && improvements.length > 0) {
      return createRuleResult(
        this,
        false,
        'Insights only highlight gaps/issues without acknowledging strengths',
        { strengthCount: 0, improvementCount: improvements.length }
      );
    }

    if (improvements.length === 0 && strengths.length > 0) {
      return createRuleResult(
        this,
        false,
        'Insights only highlight strengths without noting any gaps',
        { strengthCount: strengths.length, improvementCount: 0 }
      );
    }

    return createRuleResult(this, true, 'Balanced insights provided');
  },
};

/**
 * All mock insight rules
 */
export const INSIGHT_RULES: ValidationRule<MockInsightOutput>[] = [
  noRatingPredictionsRule,
  noInspectionGuaranteesRule,
  insightTypeValidityRule,
  riskSeverityValidityRule,
  balancedInsightsRule,
];
