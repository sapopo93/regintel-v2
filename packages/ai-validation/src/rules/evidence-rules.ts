/**
 * Evidence Analysis Validation Rules
 *
 * Rules for validating AI-generated evidence analysis outputs.
 */

import type { ValidationRule, ValidationContext, RuleResult } from './base-rule';
import { createRuleResult } from './base-rule';
import { EvidenceType, isValidEvidenceType } from '@regintel/domain/evidence-types';

/**
 * Evidence analysis output structure
 */
export interface EvidenceAnalysisOutput {
  suggestedType?: string;
  suggestedTypeConfidence?: number;
  relevantRegulations?: string[];
  keyEntities?: Array<{
    type: string;
    value: string;
    confidence?: number;
  }>;
  summary?: string;
}

/**
 * CQC Regulations (Reg 9-20 are the core ones)
 */
const VALID_CQC_REGULATIONS = new Set([
  'Reg 9', 'Regulation 9', 'Reg 9(1)', 'Reg 9(2)', 'Reg 9(3)',
  'Reg 10', 'Regulation 10', 'Reg 10(1)', 'Reg 10(2)',
  'Reg 11', 'Regulation 11', 'Reg 11(1)', 'Reg 11(2)', 'Reg 11(3)',
  'Reg 12', 'Regulation 12', 'Reg 12(1)', 'Reg 12(2)', 'Reg 12(2)(a)', 'Reg 12(2)(b)', 'Reg 12(2)(c)', 'Reg 12(2)(d)', 'Reg 12(2)(e)', 'Reg 12(2)(f)', 'Reg 12(2)(g)', 'Reg 12(2)(h)', 'Reg 12(2)(i)',
  'Reg 13', 'Regulation 13', 'Reg 13(1)', 'Reg 13(2)', 'Reg 13(3)', 'Reg 13(4)', 'Reg 13(5)', 'Reg 13(6)', 'Reg 13(7)',
  'Reg 14', 'Regulation 14', 'Reg 14(1)', 'Reg 14(2)', 'Reg 14(3)', 'Reg 14(4)', 'Reg 14(5)', 'Reg 14(6)',
  'Reg 15', 'Regulation 15', 'Reg 15(1)', 'Reg 15(2)',
  'Reg 16', 'Regulation 16', 'Reg 16(1)', 'Reg 16(2)',
  'Reg 17', 'Regulation 17', 'Reg 17(1)', 'Reg 17(2)',
  'Reg 18', 'Regulation 18', 'Reg 18(1)', 'Reg 18(2)',
  'Reg 19', 'Regulation 19', 'Reg 19(1)', 'Reg 19(2)', 'Reg 19(3)',
  'Reg 20', 'Regulation 20', 'Reg 20(1)', 'Reg 20(2)', 'Reg 20(3)',
  'Reg 20A', 'Regulation 20A',
]);

/**
 * Normalize regulation reference for comparison
 */
function normalizeRegulation(reg: string): string {
  return reg
    .replace(/regulation/gi, 'Reg')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a regulation reference is valid
 */
function isValidRegulation(reg: string, customValidSet?: Set<string>): boolean {
  const normalized = normalizeRegulation(reg);
  if (customValidSet?.has(normalized)) return true;
  if (VALID_CQC_REGULATIONS.has(normalized)) return true;

  // Check pattern match for Reg X(Y)(z) format, restricted to Reg 9-20 (plus Reg 20A)
  const match = normalized.match(/^Reg\s*(\d{1,2})([A-Z])?(\(\d+\))?(\([a-z]\))?$/i);
  if (!match) return false;

  const regNumber = parseInt(match[1], 10);
  const suffix = match[2]?.toUpperCase();

  if (suffix && suffix !== 'A') return false;
  if (suffix === 'A' && regNumber !== 20) return false;

  return regNumber >= 9 && regNumber <= 20;
}

/**
 * CRITICAL: No Hallucinated Regulations Rule
 *
 * All regulation references must exist in the valid set.
 * AI cannot invent regulations that don't exist.
 */
export const noHallucinatedRegulationsRule: ValidationRule<EvidenceAnalysisOutput> = {
  name: 'no-hallucinated-regulations',
  description: 'All regulation references must be valid CQC regulations (Reg 9-20)',
  severity: 'CRITICAL',
  category: 'hallucination',
  appliesTo: ['evidence-analysis', 'policy-generation', 'mock-insight'],

  validate(output, context): RuleResult {
    const regulations = output.relevantRegulations || [];

    if (regulations.length === 0) {
      return createRuleResult(this, true, 'No regulations referenced');
    }

    const invalid: string[] = [];
    for (const reg of regulations) {
      if (!isValidRegulation(reg, context.validRegulations)) {
        invalid.push(reg);
      }
    }

    if (invalid.length > 0) {
      return createRuleResult(
        this,
        false,
        `Invalid regulation references: ${invalid.join(', ')}`,
        { invalidRegulations: invalid, validCount: regulations.length - invalid.length }
      );
    }

    return createRuleResult(this, true, `All ${regulations.length} regulations valid`);
  },
};

/**
 * HIGH: Evidence Type Mismatch Rule
 *
 * Suggested evidence type must be a valid enum value.
 */
export const evidenceTypeMismatchRule: ValidationRule<EvidenceAnalysisOutput> = {
  name: 'evidence-type-mismatch',
  description: 'Suggested evidence type must be a valid canonical type',
  severity: 'HIGH',
  category: 'type_safety',
  appliesTo: ['evidence-analysis'],

  validate(output, context): RuleResult {
    const suggestedType = output.suggestedType;

    if (!suggestedType) {
      return createRuleResult(this, true, 'No type suggested');
    }

    if (!isValidEvidenceType(suggestedType)) {
      return createRuleResult(
        this,
        false,
        `Invalid evidence type: ${suggestedType}. Valid types: ${Object.values(EvidenceType).join(', ')}`,
        { suggestedType, validTypes: Object.values(EvidenceType) }
      );
    }

    return createRuleResult(this, true, `Valid evidence type: ${suggestedType}`);
  },
};

/**
 * HIGH: Confidence Consistency Rule
 *
 * High confidence claims must not contain hedging language.
 */
export const confidenceConsistencyRule: ValidationRule<EvidenceAnalysisOutput> = {
  name: 'confidence-consistency',
  description: 'High confidence scores must not have hedging language',
  severity: 'HIGH',
  category: 'confidence',
  appliesTo: ['evidence-analysis', 'policy-generation', 'mock-insight'],

  validate(output, context): RuleResult {
    const confidence = output.suggestedTypeConfidence ?? 0;
    const summary = output.summary || '';

    // Check for hedging language
    const hedgingPatterns = [
      /\bmight\b/i,
      /\bperhaps\b/i,
      /\bpossibly\b/i,
      /\bunsure\b/i,
      /\bnot certain\b/i,
      /\bappears to\b/i,
      /\bseems like\b/i,
      /\bcould be\b/i,
      /\bmay be\b/i,
      /\bprobably\b/i,
    ];

    const hasHedging = hedgingPatterns.some((pattern) => pattern.test(summary));

    // High confidence (>0.8) with hedging is inconsistent
    if (confidence > 0.8 && hasHedging) {
      return createRuleResult(
        this,
        false,
        `High confidence (${confidence}) with hedging language`,
        { confidence, hasHedging: true }
      );
    }

    // Low confidence (<0.5) claiming certainty is also inconsistent
    const certaintyPatterns = [
      /\bdefinitely\b/i,
      /\bcertainly\b/i,
      /\bwithout doubt\b/i,
      /\bclearly\b/i,
      /\bobviously\b/i,
    ];

    const hasCertainty = certaintyPatterns.some((pattern) => pattern.test(summary));

    if (confidence < 0.5 && hasCertainty) {
      return createRuleResult(
        this,
        false,
        `Low confidence (${confidence}) with certainty language`,
        { confidence, hasCertainty: true }
      );
    }

    return createRuleResult(this, true, 'Confidence consistent with language');
  },
};

/**
 * MEDIUM: Entity Extraction Quality Rule
 *
 * Extracted entities should have reasonable confidence.
 */
export const entityExtractionQualityRule: ValidationRule<EvidenceAnalysisOutput> = {
  name: 'entity-extraction-quality',
  description: 'Extracted entities should have confidence scores',
  severity: 'MEDIUM',
  category: 'content',
  appliesTo: ['evidence-analysis'],

  validate(output, context): RuleResult {
    const entities = output.keyEntities || [];

    if (entities.length === 0) {
      return createRuleResult(this, true, 'No entities extracted');
    }

    const lowConfidence = entities.filter(
      (e) => e.confidence !== undefined && e.confidence < 0.5
    );

    if (lowConfidence.length > entities.length * 0.5) {
      return createRuleResult(
        this,
        false,
        `More than 50% of entities have low confidence`,
        { totalEntities: entities.length, lowConfidenceCount: lowConfidence.length }
      );
    }

    return createRuleResult(this, true, `${entities.length} entities with acceptable confidence`);
  },
};

/**
 * All evidence analysis rules
 */
export const EVIDENCE_RULES: ValidationRule<EvidenceAnalysisOutput>[] = [
  noHallucinatedRegulationsRule,
  evidenceTypeMismatchRule,
  confidenceConsistencyRule,
  entityExtractionQualityRule,
];
