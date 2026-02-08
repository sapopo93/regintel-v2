/**
 * Policy Generation Validation Rules
 *
 * Rules for validating AI-generated policy drafts.
 */

import type { ValidationRule, ValidationContext, RuleResult } from './base-rule';
import { createRuleResult } from './base-rule';

/**
 * Policy generation output structure
 */
export interface PolicyGenerationOutput {
  draftPolicy?: string;
  sections?: Array<{
    title: string;
    content: string;
    regulationRef?: string;
  }>;
  confidence?: number;
}

/**
 * CRITICAL: No Compliance Assertions Rule
 *
 * AI cannot claim a policy is "compliant" or "non-compliant".
 * These are regulatory determinations that only inspectors can make.
 */
export const noComplianceAssertionsRule: ValidationRule<PolicyGenerationOutput> = {
  name: 'no-compliance-assertions',
  description: 'AI cannot make compliance determinations',
  severity: 'CRITICAL',
  category: 'compliance',
  appliesTo: ['evidence-analysis', 'policy-generation', 'mock-insight'],

  validate(output, context): RuleResult {
    const text = [
      output.draftPolicy || '',
      ...(output.sections?.map((s) => s.content) || []),
    ].join(' ');

    const forbiddenPatterns = [
      /\bthis (?:policy )?is compliant\b/i,
      /\bthis (?:policy )?is non-compliant\b/i,
      /\bthis (?:policy )?meets (?:all )?(?:regulatory )?requirements\b/i,
      /\bthis (?:policy )?fails to meet\b/i,
      /\bthis (?:policy )?does not comply\b/i,
      /\bcompliance (?:has been )?achieved\b/i,
      /\bcompliance (?:has not been|hasn't been) achieved\b/i,
      /\bfully compliant with\b/i,
      /\bnot compliant with\b/i,
      /\bwe (?:can )?confirm compliance\b/i,
      /\bwe (?:can )?certify\b/i,
      /\bpasses? (?:all )?inspection\b/i,
      /\bwill pass inspection\b/i,
      /\bwill fail inspection\b/i,
      /\bguarantees? compliance\b/i,
    ];

    const matches: string[] = [];
    for (const pattern of forbiddenPatterns) {
      const match = text.match(pattern);
      if (match) {
        matches.push(match[0]);
      }
    }

    if (matches.length > 0) {
      return createRuleResult(
        this,
        false,
        `Forbidden compliance assertions: ${matches.join(', ')}`,
        { forbiddenPhrases: matches }
      );
    }

    return createRuleResult(this, true, 'No compliance assertions found');
  },
};

/**
 * HIGH: Policy Structure Rule
 *
 * Generated policies should have proper structure.
 */
export const policyStructureRule: ValidationRule<PolicyGenerationOutput> = {
  name: 'policy-structure',
  description: 'Policy should have clear sections with titles',
  severity: 'HIGH',
  category: 'content',
  appliesTo: ['policy-generation'],

  validate(output, context): RuleResult {
    const sections = output.sections || [];

    if (sections.length === 0 && output.draftPolicy) {
      // Raw text without sections
      return createRuleResult(
        this,
        false,
        'Policy has no structured sections',
        { hasDraftText: true, sectionCount: 0 }
      );
    }

    if (sections.length === 0) {
      return createRuleResult(this, true, 'No policy content to validate');
    }

    // Check each section has title and content
    const invalidSections = sections.filter(
      (s) => !s.title?.trim() || !s.content?.trim()
    );

    if (invalidSections.length > 0) {
      return createRuleResult(
        this,
        false,
        `${invalidSections.length} sections missing title or content`,
        { invalidCount: invalidSections.length, totalSections: sections.length }
      );
    }

    return createRuleResult(this, true, `${sections.length} well-structured sections`);
  },
};

/**
 * MEDIUM: Regulation References Rule
 *
 * Policy sections should reference relevant regulations.
 */
export const regulationReferencesRule: ValidationRule<PolicyGenerationOutput> = {
  name: 'regulation-references',
  description: 'Policy sections should cite relevant regulations',
  severity: 'MEDIUM',
  category: 'content',
  appliesTo: ['policy-generation'],

  validate(output, context): RuleResult {
    const sections = output.sections || [];

    if (sections.length === 0) {
      return createRuleResult(this, true, 'No sections to validate');
    }

    const withRefs = sections.filter((s) => s.regulationRef?.trim());
    const coverage = withRefs.length / sections.length;

    if (coverage < 0.5) {
      return createRuleResult(
        this,
        false,
        `Only ${Math.round(coverage * 100)}% of sections have regulation references`,
        { sectionsWithRefs: withRefs.length, totalSections: sections.length }
      );
    }

    return createRuleResult(this, true, `${Math.round(coverage * 100)}% regulation coverage`);
  },
};

/**
 * LOW: Content Length Rule
 *
 * Policy sections should have substantive content.
 */
export const contentLengthRule: ValidationRule<PolicyGenerationOutput> = {
  name: 'content-length',
  description: 'Policy sections should have substantive content',
  severity: 'LOW',
  category: 'content',
  appliesTo: ['policy-generation'],

  validate(output, context): RuleResult {
    const sections = output.sections || [];

    if (sections.length === 0) {
      return createRuleResult(this, true, 'No sections to validate');
    }

    const tooShort = sections.filter((s) => (s.content?.length || 0) < 50);

    if (tooShort.length > 0) {
      return createRuleResult(
        this,
        false,
        `${tooShort.length} sections have less than 50 characters`,
        { shortSections: tooShort.map((s) => s.title) }
      );
    }

    return createRuleResult(this, true, 'All sections have substantive content');
  },
};

/**
 * All policy generation rules
 */
export const POLICY_RULES: ValidationRule<PolicyGenerationOutput>[] = [
  noComplianceAssertionsRule,
  policyStructureRule,
  regulationReferencesRule,
  contentLengthRule,
];
