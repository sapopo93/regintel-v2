/**
 * Evidence Analysis Prompt Template
 *
 * Prompt for analyzing uploaded evidence documents.
 */

import { EvidenceType } from '@regintel/domain/evidence-types';

/**
 * Evidence analysis input
 */
export interface EvidenceAnalysisInput {
  /** Extracted text from document */
  extractedText: string;

  /** File name */
  fileName: string;

  /** MIME type */
  mimeType: string;

  /** Current evidence type hint (if user selected one) */
  evidenceTypeHint?: EvidenceType;

  /** Facility service type for context */
  serviceType?: string;

  /** Additional context */
  context?: string;
}

/**
 * Expected output schema for Gemini
 */
export const EVIDENCE_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    suggestedType: {
      type: 'string',
      description: `Evidence type. Must be one of: ${Object.values(EvidenceType).join(', ')}`,
    },
    suggestedTypeConfidence: {
      type: 'number',
      description: 'Confidence in suggested type (0.0 to 1.0)',
    },
    relevantRegulations: {
      type: 'array',
      items: { type: 'string' },
      description: 'CQC regulations this evidence may relate to. Format: "Reg X" or "Reg X(Y)(z)". Only use Reg 9-20.',
    },
    keyEntities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Entity type: date, person, organization, location, procedure, medication, risk' },
          value: { type: 'string', description: 'Extracted value' },
          confidence: { type: 'number', description: 'Extraction confidence (0.0 to 1.0)' },
        },
      },
      description: 'Key entities extracted from document',
    },
    summary: {
      type: 'string',
      description: 'Brief summary of document content and purpose (2-3 sentences)',
    },
  },
  required: ['suggestedType', 'suggestedTypeConfidence', 'relevantRegulations', 'summary'],
};

/**
 * Build evidence analysis prompt
 */
export function buildEvidenceAnalysisPrompt(input: EvidenceAnalysisInput): string {
  const evidenceTypes = Object.values(EvidenceType).join(', ');

  let prompt = `You are analyzing a document uploaded as evidence for CQC regulatory compliance.

DOCUMENT INFORMATION:
- File name: ${input.fileName}
- MIME type: ${input.mimeType}
${input.evidenceTypeHint ? `- User suggested type: ${input.evidenceTypeHint}` : ''}
${input.serviceType ? `- Service type: ${input.serviceType}` : ''}
${input.context ? `- Additional context: ${input.context}` : ''}

DOCUMENT TEXT:
---
${input.extractedText.slice(0, 15000)}
---
${input.extractedText.length > 15000 ? `\n[Document truncated. Original length: ${input.extractedText.length} characters]\n` : ''}

TASK:
Analyze this document and provide:

1. SUGGESTED TYPE: Classify the document as one of these types ONLY:
   ${evidenceTypes}

2. CONFIDENCE: Your confidence in the type classification (0.0 to 1.0)

3. RELEVANT REGULATIONS: List CQC regulations this evidence may support.
   CRITICAL: Only use valid CQC regulations from Reg 9 through Reg 20.
   Format: "Reg 12(2)(a)" or "Reg 18(1)"
   Do NOT invent regulations. If unsure, use an empty array.

4. KEY ENTITIES: Extract relevant entities like dates, people, procedures, risks.

5. SUMMARY: Brief 2-3 sentence summary of the document's content and purpose.

IMPORTANT CONSTRAINTS:
- DO NOT claim this document makes the provider "compliant" or "non-compliant"
- DO NOT predict inspection outcomes
- Only reference regulations that actually exist (Reg 9-20)
- Be conservative with confidence scores
- If you cannot classify the document, use type "OTHER" with low confidence`;

  return prompt;
}
