/**
 * Mock Insight Prompt Template
 *
 * Prompt for generating advisory insights during mock inspections.
 */

import { EvidenceType } from '@regintel/domain/evidence-types';

/**
 * Mock insight input
 */
export interface MockInsightInput {
  /** Topic being inspected */
  topicId: string;

  /** Topic title */
  topicTitle: string;

  /** Regulation being assessed */
  regulationSectionId: string;

  /** Current question asked */
  question: string;

  /** Provider's answer */
  answer: string;

  /** Previous Q&A exchanges in this session */
  previousExchanges?: Array<{
    question: string;
    answer: string;
  }>;

  /** Evidence available for this topic */
  evidenceContext?: Array<{
    evidenceType: EvidenceType;
    fileName: string;
    summary?: string;
  }>;

  /** Service type for context */
  serviceType?: string;
}

/**
 * Expected output schema for Gemini
 */
export const MOCK_INSIGHT_SCHEMA = {
  type: 'object',
  properties: {
    insights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['strength', 'gap', 'suggestion', 'follow_up'],
            description: 'Insight type',
          },
          content: {
            type: 'string',
            description: 'Insight content',
          },
          confidence: {
            type: 'number',
            description: 'Confidence in this insight (0.0 to 1.0)',
          },
          regulationRef: {
            type: 'string',
            description: 'Related regulation (e.g., "Reg 12(2)(a)")',
          },
        },
        required: ['type', 'content', 'confidence'],
      },
      description: 'Advisory insights based on the response',
    },
    suggestedFollowUp: {
      type: 'string',
      description: 'Suggested follow-up question (if appropriate)',
    },
    riskIndicators: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          indicator: { type: 'string', description: 'Risk indicator description' },
          severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], description: 'Severity level' },
        },
        required: ['indicator', 'severity'],
      },
      description: 'Potential risk indicators identified',
    },
  },
  required: ['insights', 'riskIndicators'],
};

/**
 * Build mock insight prompt
 */
export function buildMockInsightPrompt(input: MockInsightInput): string {
  let prompt = `You are providing advisory insights during a MOCK inspection preparation session.

THIS IS A PRACTICE SESSION - NOT AN OFFICIAL INSPECTION.

CONTEXT:
- Topic: ${input.topicTitle} (${input.topicId})
- Regulation: ${input.regulationSectionId}
${input.serviceType ? `- Service type: ${input.serviceType}` : ''}

${input.previousExchanges?.length ? `PREVIOUS EXCHANGES IN THIS SESSION:
${input.previousExchanges.map((ex, i) => `
Q${i + 1}: ${ex.question}
A${i + 1}: ${ex.answer}
`).join('')}` : ''}

CURRENT EXCHANGE:
Question: ${input.question}

Provider's Answer:
---
${input.answer}
---

${input.evidenceContext?.length ? `AVAILABLE EVIDENCE:
${input.evidenceContext.map((e) => `- ${e.evidenceType}: ${e.fileName}${e.summary ? ` (${e.summary})` : ''}`).join('\n')}` : ''}

TASK:
Provide advisory insights to help the provider prepare for a real CQC inspection.

Generate insights in these categories:

1. STRENGTHS (type: "strength")
   - What did the provider do well in their response?
   - What evidence of good practice was demonstrated?

2. GAPS (type: "gap")
   - What areas might need more attention?
   - What was missing from the response?

3. SUGGESTIONS (type: "suggestion")
   - Practical recommendations for improvement
   - Evidence that could strengthen their position

4. FOLLOW-UP (type: "follow_up")
   - Clarifying questions that might help

Also identify any RISK INDICATORS:
- Areas that might raise concerns during a real inspection
- Rate as LOW, MEDIUM, or HIGH severity

CRITICAL CONSTRAINTS:
- This is ADVISORY ONLY - you are NOT an inspector
- DO NOT predict ratings (Good, Requires Improvement, etc.)
- DO NOT claim the provider will "pass" or "fail" inspection
- DO NOT guarantee any outcomes
- DO NOT make compliance determinations
- Only reference valid CQC regulations (Reg 9-20)
- Be balanced - identify both strengths AND areas for improvement
- Be constructive and actionable in suggestions

Your insights should help the provider prepare, not judge them.`;

  return prompt;
}
