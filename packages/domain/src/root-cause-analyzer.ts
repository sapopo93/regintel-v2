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
        `finding evidence: ${finding.description}`,
      disconfirmingTests: [
        `Locate a current procedure covering ${finding.regulationSectionId}.`,
        `Sample recent records proving adherence to ${finding.regulationSectionId}.`,
      ],
      confidence: 'medium',
    },
    {
      hypothesis:
        `Capability gap: staffing, training, or tooling is insufficient ` +
        `to meet "${finding.title}".`,
      rationale:
        `Impact ${finding.impactScore} and likelihood ${finding.likelihoodScore} ` +
        'suggest sustained operational strain.',
      disconfirmingTests: [
        `Verify training completion for roles tied to ${finding.regulationSectionId}.`,
        `Review staffing coverage against required ratios for the last 90 days.`,
      ],
      confidence: 'low',
    },
  ];

  return templates.map((template, index) => ({
    ...template,
    hypothesisId: computeHypothesisId({
      findingId: finding.id,
      hypothesis: template.hypothesis,
      index,
    }),
  }));
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
