/**
 * Policy Generation Prompt Template
 *
 * Prompt for generating policy drafts based on regulations.
 */

/**
 * Policy generation input
 */
export interface PolicyGenerationInput {
  /** Type of policy to generate */
  policyType: string;

  /** Regulations to address */
  regulationIds: string[];

  /** Existing policy text (for updates) */
  existingPolicyText?: string;

  /** Service type for context */
  serviceType?: string;

  /** Facility capacity */
  capacity?: number;

  /** Special conditions to address */
  specialConditions?: string[];

  /** Provider name */
  providerName?: string;
}

/**
 * Expected output schema for Gemini
 */
export const POLICY_GENERATION_SCHEMA = {
  type: 'object',
  properties: {
    draftPolicy: {
      type: 'string',
      description: 'Complete policy text (optional, use sections instead for structured output)',
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Section title' },
          content: { type: 'string', description: 'Section content' },
          regulationRef: { type: 'string', description: 'Regulation this section addresses (e.g., "Reg 12(2)(a)")' },
        },
        required: ['title', 'content'],
      },
      description: 'Structured policy sections',
    },
    confidence: {
      type: 'number',
      description: 'Confidence in generated policy (0.0 to 1.0)',
    },
  },
  required: ['sections', 'confidence'],
};

/**
 * Build policy generation prompt
 */
export function buildPolicyGenerationPrompt(input: PolicyGenerationInput): string {
  const regulations = input.regulationIds.join(', ');

  let prompt = `You are drafting a care service policy document to address CQC regulatory requirements.

POLICY DETAILS:
- Policy type: ${input.policyType}
- Regulations to address: ${regulations}
${input.serviceType ? `- Service type: ${input.serviceType}` : ''}
${input.capacity ? `- Facility capacity: ${input.capacity} residents` : ''}
${input.providerName ? `- Provider: ${input.providerName}` : ''}
${input.specialConditions?.length ? `- Special considerations: ${input.specialConditions.join(', ')}` : ''}

${input.existingPolicyText ? `EXISTING POLICY (for reference/update):
---
${input.existingPolicyText.slice(0, 10000)}
---
${input.existingPolicyText.length > 10000 ? '[Truncated]' : ''}

Please update or improve the existing policy while maintaining its core structure.` : ''}

TASK:
Generate a draft policy with the following structure:

1. PURPOSE & SCOPE
   - Clear statement of policy purpose
   - Who this policy applies to

2. POLICY STATEMENT
   - Main policy commitments
   - How the policy aligns with regulations

3. PROCEDURES
   - Step-by-step procedures to follow
   - Roles and responsibilities

4. MONITORING & REVIEW
   - How compliance will be monitored
   - Review frequency

5. RELATED DOCUMENTS
   - Associated policies and procedures

For each section, include:
- Title
- Content (substantive, actionable guidance)
- Regulation reference if applicable

IMPORTANT CONSTRAINTS:
- DO NOT claim this policy will make the provider "compliant"
- DO NOT guarantee inspection outcomes
- Use clear, professional language
- Include specific, actionable procedures
- Reference only valid CQC regulations (Reg 9-20)
- This is a DRAFT that must be reviewed by the provider

Your confidence score should reflect:
- How well the policy addresses the specified regulations
- How complete and actionable the procedures are
- Whether any gaps remain`;

  return prompt;
}
