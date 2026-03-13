/**
 * Root Cause Analyzer (Phase 11: Blue Ocean)
 *
 * Deterministic root-cause hypothesis generation from spine findings.
 * Produces at least two hypotheses per major finding with disconfirming tests.
 */

import { createHash } from 'node:crypto';
import type { InspectionFinding } from './inspection-finding.js';
import type { ContentHash, FindingId, Severity } from './types.js';

export type RootCauseConfidence = 'low' | 'medium' | 'high';

export interface RootCauseHypothesis {
  hypothesisId: ContentHash;
  hypothesis: string;
  rationale: string;
  disconfirmingTests: string[];
  confidence: RootCauseConfidence;
}

export interface RootCauseAnalysis {
  findingId: FindingId;
  severity: Severity;
  title: string;
  hypotheses: RootCauseHypothesis[];
}

const SEVERITY_PRIORITY: Record<Severity, number> = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
  INFO: 5,
};

export function isMajorFinding(finding: InspectionFinding): boolean {
  return finding.severity === 'CRITICAL' || finding.severity === 'HIGH';
}

export function sortFindingsByPriority(
  findings: InspectionFinding[]
): InspectionFinding[] {
  return [...findings].sort((a, b) => {
    const severityDiff = SEVERITY_PRIORITY[a.severity] - SEVERITY_PRIORITY[b.severity];
    if (severityDiff !== 0) return severityDiff;
    if (b.compositeRiskScore !== a.compositeRiskScore) {
      return b.compositeRiskScore - a.compositeRiskScore;
    }
    return a.id < b.id ? -1 : 1;
  });
}

function computeHypothesisId(input: {
  findingId: FindingId;
  hypothesis: string;
  index: number;
}): ContentHash {
  const json = JSON.stringify({
    findingId: input.findingId,
    hypothesis: input.hypothesis,
    index: input.index,
  });
  return createHash('sha256').update(json).digest('hex');
}

function buildHypotheses(finding: InspectionFinding): RootCauseHypothesis[] {
  const templates: Array<Omit<RootCauseHypothesis, 'hypothesisId'>> = [
    {
      hypothesis:
        `Process control gap: documented procedure for "${finding.title}" ` +
        'is missing, outdated, or not enforced.',
      rationale:
        `Regulation ${finding.regulationSectionId} is unmet; ` +
        `finding evidence: ${finding.description} Link: W4 (Governance)`,
      disconfirmingTests: [
        `Locate a dated, version-controlled procedure for ${finding.regulationSectionId} with named author and review date within the last 12 months.`,
        `Sample 5 records from the last 30 days demonstrating ${finding.regulationSectionId} compliance with signatures and timestamps.`,
      ],
      confidence: 'medium',
    },
    {
      hypothesis:
        `Capability gap: staffing, training, or tooling is insufficient ` +
        `to meet "${finding.title}".`,
      rationale:
        `Impact ${finding.impactScore} and likelihood ${finding.likelihoodScore} ` +
        'suggest sustained operational strain. Link: S6 (Safe staffing), C5 (Workforce wellbeing)',
      disconfirmingTests: [
        `Check training matrix for ${finding.regulationSectionId}-related competencies: % completion, any expired certifications, last assessment dates.`,
        `Review staffing rotas and dependency assessments against required ratios for the last 90 days.`,
      ],
      confidence: finding.severity === 'CRITICAL' ? 'medium' : 'low',
    },
  ];

  const hypotheses = templates.map((template, index) => ({
    ...template,
    hypothesisId: computeHypothesisId({
      findingId: finding.id,
      hypothesis: template.hypothesis,
      index,
    }),
  }));

  // INVARIANT: Existing hypotheses at index 0-1 must not be reordered. New hypotheses append at index 2+.

  // Hypothesis 3: Governance erosion — triggered when finding touches Safe domain
  if (finding.regulationSectionId.includes('Reg 12') ||
      finding.regulationSectionId.includes('Reg 13') ||
      finding.regulationSectionId.includes('Reg 15') ||
      finding.regulationSectionId.includes('Reg 18') ||
      finding.severity === 'CRITICAL') {
    const govHypothesis: Omit<RootCauseHypothesis, 'hypothesisId'> = {
      hypothesis:
        `Governance erosion: leadership oversight gap — internal audit or quality monitoring ` +
        `failed to detect "${finding.title}" before external assessment.`,
      rationale:
        `Regulation ${finding.regulationSectionId} breach suggests governance monitoring gap. ` +
        `Link: W4 (Governance), W6 (Learning and innovation)`,
      disconfirmingTests: [
        `Review internal audit schedule and last completed cycle for ${finding.regulationSectionId}.`,
        `Verify management action log shows this area was monitored in the last 90 days.`,
      ],
      confidence: finding.severity === 'CRITICAL' ? 'high' : 'medium',
    };
    hypotheses.push({
      ...govHypothesis,
      hypothesisId: computeHypothesisId({
        findingId: finding.id,
        hypothesis: govHypothesis.hypothesis,
        index: hypotheses.length,
      }),
    });
  }

  // Hypothesis 4: Cultural/systemic gap — triggered for CRITICAL severity
  if (finding.severity === 'CRITICAL') {
    const culturalHypothesis: Omit<RootCauseHypothesis, 'hypothesisId'> = {
      hypothesis:
        `Cultural gap: the organisation's safety culture may not support staff in ` +
        `raising concerns or learning from incidents related to "${finding.title}".`,
      rationale:
        `Critical severity finding suggests potential systemic issue beyond individual performance. ` +
        `Link: W1 (Shared direction), W3 (Freedom to speak up)`,
      disconfirmingTests: [
        `Review Freedom to Speak Up records for the last 12 months.`,
        `Check staff survey results or exit interview themes for fear/blame indicators.`,
      ],
      confidence: 'medium',
    };
    hypotheses.push({
      ...culturalHypothesis,
      hypothesisId: computeHypothesisId({
        findingId: finding.id,
        hypothesis: culturalHypothesis.hypothesis,
        index: hypotheses.length,
      }),
    });
  }

  return hypotheses;
}

/**
 * Generates deterministic root-cause analysis for major findings.
 */
export function analyzeRootCauses(
  findings: InspectionFinding[]
): RootCauseAnalysis[] {
  const ordered = sortFindingsByPriority(findings);
  const analyses: RootCauseAnalysis[] = [];

  for (const finding of ordered) {
    if (!isMajorFinding(finding)) continue;
    analyses.push({
      findingId: finding.id,
      severity: finding.severity,
      title: finding.title,
      hypotheses: buildHypotheses(finding),
    });
  }

  return analyses;
}
