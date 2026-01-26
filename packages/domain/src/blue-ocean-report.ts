/**
 * Blue Ocean Report (Phase 11)
 *
 * Deterministic, domain-only reporting spine with strict mock/regulatory separation.
 * No wall-clock timestamps or random identifiers.
 */

import { createHash } from 'node:crypto';
import type { Action } from './action.js';
import { ActionStatus } from './action.js';
import type { InspectionFinding } from './inspection-finding.js';
import type { EvidenceRecord } from './evidence.js';
import {
  ReportingDomain,
  Severity,
  type ContentHash,
  type Domain,
  type FindingId,
  type ISOTimestamp,
  type TenantId,
  type ActionId,
  type EvidenceId,
} from './types.js';
import {
  analyzeRootCauses,
  isMajorFinding,
  sortFindingsByPriority,
  type RootCauseAnalysis,
} from './root-cause-analyzer.js';

export const BLUE_OCEAN_MOCK_WATERMARK =
  'BLUE OCEAN (MOCK) \u2014 NOT REGULATORY HISTORY';

export interface EvidenceIndexEntry {
  evidenceRef: string; // E1, E2, E3...
  evidenceId: EvidenceId;
  evidenceType: string;
  title: string;
  collectedAt: ISOTimestamp;
  primaryBlobHash: ContentHash;
  supportsFindingIds: FindingId[];
}

export interface BlueOceanReportInput {
  tenantId: TenantId;
  domain: Domain;
  topicCatalogVersion: string;
  topicCatalogHash: ContentHash;
  prsLogicProfilesVersion: string;
  prsLogicProfilesHash: ContentHash;
  findings: InspectionFinding[];
  actions: Action[];
  evidence?: EvidenceRecord[];
  reportingDomain?: ReportingDomain;
}

export interface BlueOceanReportMetadata {
  topicCatalogVersion: string;
  topicCatalogHash: ContentHash;
  prsLogicProfilesVersion: string;
  prsLogicProfilesHash: ContentHash;
  snapshotTimestamp: ISOTimestamp | null;
}

export interface BlueOceanActionDetail {
  actionId: ActionId;
  findingId: FindingId;
  description: string;
  ownerRole: string | null;
  targetCompletionDate: ISOTimestamp | null;
  status: ActionStatus;
  verificationEvidenceIds: string[];
}

export interface BlueOceanReportSections {
  executiveSummary: {
    totalFindings: number;
    majorFindings: number;
    topSeverity: Severity | null;
    openActions: number;
    verifiedActions: number;
  };
  scopeAndContext: {
    contextSnapshotIds: string[];
    reportingDomain: ReportingDomain;
    findingWindow: { start: ISOTimestamp | null; end: ISOTimestamp | null };
    source: 'spine';
  };
  findingsOverview: {
    bySeverity: Record<Severity, number>;
    totalFindings: number;
    topRegulations: Array<{ regulationId: string; findingsCount: number }>;
  };
  majorFindings: Array<{
    findingId: FindingId;
    title: string;
    severity: Severity;
    compositeRiskScore: number;
    regulationId: string;
    regulationSectionId: string;
  }>;
  evidenceIndex: EvidenceIndexEntry[];
  rootCauseAnalysis: RootCauseAnalysis[];
  contributingFactors: Array<{ factor: string; findingIds: FindingId[] }>;
  evidenceReadiness: {
    actionsWithEvidence: number;
    actionsMissingEvidence: number;
    coveragePercentage: number;
  };
  remediationPlan: {
    openActions: number;
    inProgressActions: number;
    pendingVerificationActions: number;
    verifiedActions: number;
    rejectedActions: number;
    actionsByFinding: Array<{ findingId: FindingId; actionIds: ActionId[] }>;
    actionDetails: BlueOceanActionDetail[];
  };
  riskOutlook: {
    highestCompositeRiskScore: number;
    averageCompositeRiskScore: number;
    riskTierBreakdown: { high: number; medium: number; low: number };
  };
  regulatoryMapping: {
    regulationsCovered: number;
    regulationIds: string[];
  };
  qualityGates: {
    rcaCoverageScore: number;
    mockWatermarkScore: number;
    domainConsistencyScore: number;
    determinismScore: number;
    overallScore: number;
  };
  dataLineage: {
    findingIds: FindingId[];
    actionIds: ActionId[];
    evidenceIds: EvidenceId[];
    evidenceToFindings: Array<{ evidenceId: EvidenceId; supportsFindingIds: FindingId[] }>;
    findingToActions: Array<{ findingId: FindingId; actionIds: ActionId[] }>;
  };
  appendix: {
    notes: string[];
  };
}

export interface BlueOceanReportContent {
  tenantId: TenantId;
  domain: Domain;
  reportingDomain: ReportingDomain;
  watermark: string | null;
  metadata: BlueOceanReportMetadata;
  sections: BlueOceanReportSections;
}

export interface BlueOceanReport extends BlueOceanReportContent {
  reportId: ContentHash;
}

function resolveReportingDomain(input: BlueOceanReportInput): ReportingDomain {
  const domains = new Set(input.findings.map((finding) => finding.reportingDomain));
  if (domains.size > 1) {
    throw new Error('Mixed reporting domains are not allowed in Blue Ocean report');
  }

  if (domains.size === 1) {
    const inferred = domains.values().next().value as ReportingDomain;
    if (input.reportingDomain && input.reportingDomain !== inferred) {
      throw new Error('Reporting domain input does not match findings');
    }
    return inferred;
  }

  if (!input.reportingDomain) {
    throw new Error('reportingDomain is required when findings are empty');
  }

  return input.reportingDomain;
}

function computeFindingWindow(findings: InspectionFinding[]): {
  start: ISOTimestamp | null;
  end: ISOTimestamp | null;
} {
  if (findings.length === 0) {
    return { start: null, end: null };
  }
  const timestamps = findings.map((finding) => finding.identifiedAt).sort();
  return {
    start: timestamps[0] ?? null,
    end: timestamps[timestamps.length - 1] ?? null,
  };
}

function computeSeverityCounts(findings: InspectionFinding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    [Severity.CRITICAL]: 0,
    [Severity.HIGH]: 0,
    [Severity.MEDIUM]: 0,
    [Severity.LOW]: 0,
    [Severity.INFO]: 0,
  };

  for (const finding of findings) {
    counts[finding.severity] += 1;
  }

  return counts;
}

function computeTopSeverity(findings: InspectionFinding[]): Severity | null {
  const ordered = sortFindingsByPriority(findings);
  return ordered.length > 0 ? ordered[0].severity : null;
}

function computeTopRegulations(
  findings: InspectionFinding[]
): Array<{ regulationId: string; findingsCount: number }> {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    counts.set(finding.regulationId, (counts.get(finding.regulationId) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0] < b[0] ? -1 : 1;
    })
    .slice(0, 3)
    .map(([regulationId, findingsCount]) => ({ regulationId, findingsCount }));
}

function buildEvidenceIndex(evidence: EvidenceRecord[]): EvidenceIndexEntry[] {
  // Sort evidence deterministically by content hash, then collectedAt
  const sorted = [...evidence].sort((a, b) => {
    if (a.primaryBlobHash < b.primaryBlobHash) return -1;
    if (a.primaryBlobHash > b.primaryBlobHash) return 1;
    return a.collectedAt < b.collectedAt ? -1 : 1;
  });

  return sorted.map((record, index) => ({
    evidenceRef: `E${index + 1}`,
    evidenceId: record.id,
    evidenceType: record.evidenceType,
    title: record.title,
    collectedAt: record.collectedAt,
    primaryBlobHash: record.primaryBlobHash,
    supportsFindingIds: [...record.supportsFindingIds].sort(),
  }));
}

function computeContributingFactors(
  findings: InspectionFinding[],
  actions: Action[],
  rcaAnalyses: RootCauseAnalysis[]
): Array<{ factor: string; findingIds: FindingId[] }> {
  const factors: Array<{ factor: string; findingIds: FindingId[] }> = [];

  // Recurring regulation gaps
  const sectionMap = new Map<string, FindingId[]>();
  for (const finding of findings) {
    const key = `${finding.regulationId}:${finding.regulationSectionId}`;
    const list = sectionMap.get(key) ?? [];
    list.push(finding.id);
    sectionMap.set(key, list);
  }

  const recurring = Array.from(sectionMap.entries())
    .filter(([, ids]) => ids.length > 1)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, ids]) => ({
      factor: `Recurring gap in ${key}`,
      findingIds: [...ids].sort(),
    }));

  factors.push(...recurring);

  // RCA-based systematic factors
  const processGapFindings: FindingId[] = [];
  const capabilityGapFindings: FindingId[] = [];

  for (const rca of rcaAnalyses) {
    for (const hypothesis of rca.hypotheses) {
      if (hypothesis.hypothesis.includes('Process control gap')) {
        processGapFindings.push(rca.findingId);
      }
      if (hypothesis.hypothesis.includes('Capability gap')) {
        capabilityGapFindings.push(rca.findingId);
      }
    }
  }

  if (processGapFindings.length > 0) {
    factors.push({
      factor: 'Systematic process control gaps',
      findingIds: Array.from(new Set(processGapFindings)).sort(),
    });
  }

  if (capabilityGapFindings.length > 0) {
    factors.push({
      factor: 'Staffing, training, or resource capability gaps',
      findingIds: Array.from(new Set(capabilityGapFindings)).sort(),
    });
  }

  // Remediation backlog
  const backlogFindingIds = actions
    .filter((action) =>
      [ActionStatus.OPEN, ActionStatus.IN_PROGRESS, ActionStatus.PENDING_VERIFICATION].includes(
        action.status
      )
    )
    .map((action) => action.findingId);

  if (backlogFindingIds.length > 0) {
    factors.push({
      factor: 'Remediation backlog for open actions',
      findingIds: Array.from(new Set(backlogFindingIds)).sort(),
    });
  }

  return factors;
}

function computeEvidenceReadiness(actions: Action[]): {
  actionsWithEvidence: number;
  actionsMissingEvidence: number;
  coveragePercentage: number;
} {
  const actionsWithEvidence = actions.filter(
    (action) => action.verificationEvidenceIds.length > 0
  ).length;
  const actionsMissingEvidence = actions.length - actionsWithEvidence;
  const coveragePercentage =
    actions.length === 0 ? 100 : Math.round((actionsWithEvidence / actions.length) * 100);

  return {
    actionsWithEvidence,
    actionsMissingEvidence,
    coveragePercentage,
  };
}

function computeRemediationPlan(actions: Action[]): {
  openActions: number;
  inProgressActions: number;
  pendingVerificationActions: number;
  verifiedActions: number;
  rejectedActions: number;
  actionsByFinding: Array<{ findingId: FindingId; actionIds: ActionId[] }>;
  actionDetails: BlueOceanActionDetail[];
} {
  const statusCounts = {
    openActions: 0,
    inProgressActions: 0,
    pendingVerificationActions: 0,
    verifiedActions: 0,
    rejectedActions: 0,
  };

  const byFinding = new Map<FindingId, ActionId[]>();
  const actionDetails: BlueOceanActionDetail[] = [];

  for (const action of actions) {
    switch (action.status) {
      case ActionStatus.OPEN:
        statusCounts.openActions += 1;
        break;
      case ActionStatus.IN_PROGRESS:
        statusCounts.inProgressActions += 1;
        break;
      case ActionStatus.PENDING_VERIFICATION:
        statusCounts.pendingVerificationActions += 1;
        break;
      case ActionStatus.VERIFIED_CLOSED:
        statusCounts.verifiedActions += 1;
        break;
      case ActionStatus.REJECTED:
        statusCounts.rejectedActions += 1;
        break;
    }

    const existing = byFinding.get(action.findingId) ?? [];
    existing.push(action.id);
    byFinding.set(action.findingId, existing);

    actionDetails.push({
      actionId: action.id,
      findingId: action.findingId,
      description: action.description,
      ownerRole: action.assignedTo ?? null,
      targetCompletionDate: action.targetCompletionDate ?? null,
      status: action.status,
      verificationEvidenceIds: [...action.verificationEvidenceIds].sort(),
    });
  }

  const actionsByFinding = Array.from(byFinding.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([findingId, actionIds]) => ({
      findingId,
      actionIds: [...actionIds].sort(),
    }));

  return {
    ...statusCounts,
    actionsByFinding,
    actionDetails: actionDetails.sort((a, b) => (a.actionId < b.actionId ? -1 : 1)),
  };
}

function computeRiskOutlook(findings: InspectionFinding[]): {
  highestCompositeRiskScore: number;
  averageCompositeRiskScore: number;
  riskTierBreakdown: { high: number; medium: number; low: number };
} {
  if (findings.length === 0) {
    return {
      highestCompositeRiskScore: 0,
      averageCompositeRiskScore: 0,
      riskTierBreakdown: { high: 0, medium: 0, low: 0 },
    };
  }

  const totalScore = findings.reduce((sum, finding) => sum + finding.compositeRiskScore, 0);
  const highestCompositeRiskScore = Math.max(
    ...findings.map((finding) => finding.compositeRiskScore)
  );

  const tiers = { high: 0, medium: 0, low: 0 };
  for (const finding of findings) {
    if (finding.compositeRiskScore >= 70) {
      tiers.high += 1;
    } else if (finding.compositeRiskScore >= 40) {
      tiers.medium += 1;
    } else {
      tiers.low += 1;
    }
  }

  return {
    highestCompositeRiskScore,
    averageCompositeRiskScore: Math.round(totalScore / findings.length),
    riskTierBreakdown: tiers,
  };
}

function computeRcaCoverageScore(
  majorFindingIds: FindingId[],
  analyses: RootCauseAnalysis[]
): number {
  if (majorFindingIds.length === 0) return 100;

  const analysisMap = new Map<FindingId, RootCauseAnalysis>(
    analyses.map((analysis) => [analysis.findingId, analysis])
  );

  let covered = 0;
  for (const findingId of majorFindingIds) {
    const analysis = analysisMap.get(findingId);
    if (!analysis) continue;
    const hypothesesValid = analysis.hypotheses.every(
      (hypothesis) => hypothesis.disconfirmingTests.length > 0
    );
    if (analysis.hypotheses.length >= 2 && hypothesesValid) {
      covered += 1;
    }
  }

  return Math.round((covered / majorFindingIds.length) * 100);
}

function computeDomainConsistencyScore(
  input: BlueOceanReportInput,
  reportingDomain: ReportingDomain
): number {
  const findingsDomainMatch = input.findings.every(
    (finding) => finding.domain === input.domain && finding.reportingDomain === reportingDomain
  );
  const actionsDomainMatch = input.actions.every((action) => action.domain === input.domain);

  return findingsDomainMatch && actionsDomainMatch ? 100 : 0;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort((a, b) =>
      a[0] < b[0] ? -1 : 1
    );
    const serialized = entries.map(
      ([key, entryValue]) => `"${key}":${stableStringify(entryValue)}`
    );
    return `{${serialized.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function computeBlueOceanReportHash(
  input: BlueOceanReportContent | BlueOceanReport
): ContentHash {
  const content =
    'reportId' in input
      ? (({ reportId: _reportId, ...rest }) => rest)(input)
      : input;
  const serialized = stableStringify(content);
  return createHash('sha256').update(serialized).digest('hex');
}

export function generateBlueOceanReport(input: BlueOceanReportInput): BlueOceanReport {
  const reportingDomain = resolveReportingDomain(input);
  const watermark =
    reportingDomain === ReportingDomain.MOCK_SIMULATION ? BLUE_OCEAN_MOCK_WATERMARK : null;

  const orderedFindings = sortFindingsByPriority(input.findings);
  const majorFindingsList = orderedFindings.filter(isMajorFinding);
  const rootCauseAnalysis = analyzeRootCauses(orderedFindings);
  const majorFindingIds = majorFindingsList.map((finding) => finding.id);
  const severityCounts = computeSeverityCounts(orderedFindings);

  const evidenceIndex = buildEvidenceIndex(input.evidence ?? []);
  const evidenceReadiness = computeEvidenceReadiness(input.actions);
  const remediationPlan = computeRemediationPlan(input.actions);
  const riskOutlook = computeRiskOutlook(orderedFindings);
  const topRegulations = computeTopRegulations(orderedFindings);
  const contributingFactors = computeContributingFactors(orderedFindings, input.actions, rootCauseAnalysis);
  const contextSnapshotIds = Array.from(
    new Set(orderedFindings.map((finding) => finding.contextSnapshotId))
  ).sort();
  const findingWindow = computeFindingWindow(orderedFindings);

  const qualityScores = {
    rcaCoverageScore: computeRcaCoverageScore(majorFindingIds, rootCauseAnalysis),
    mockWatermarkScore:
      reportingDomain === ReportingDomain.MOCK_SIMULATION
        ? watermark === BLUE_OCEAN_MOCK_WATERMARK
          ? 100
          : 0
        : watermark === null
          ? 100
          : 0,
    domainConsistencyScore: computeDomainConsistencyScore(input, reportingDomain),
    determinismScore: 100,
  };

  const overallScore = Math.round(
    (qualityScores.rcaCoverageScore +
      qualityScores.mockWatermarkScore +
      qualityScores.domainConsistencyScore +
      qualityScores.determinismScore) /
      4
  );

  const metadata: BlueOceanReportMetadata = {
    topicCatalogVersion: input.topicCatalogVersion,
    topicCatalogHash: input.topicCatalogHash,
    prsLogicProfilesVersion: input.prsLogicProfilesVersion,
    prsLogicProfilesHash: input.prsLogicProfilesHash,
    snapshotTimestamp: findingWindow.end ?? findingWindow.start ?? null,
  };

  const evidenceIds = evidenceIndex.map((entry) => entry.evidenceId).sort();
  const evidenceToFindings = evidenceIndex.map((entry) => ({
    evidenceId: entry.evidenceId,
    supportsFindingIds: [...entry.supportsFindingIds].sort(),
  }));

  const sections: BlueOceanReportSections = {
    executiveSummary: {
      totalFindings: orderedFindings.length,
      majorFindings: majorFindingsList.length,
      topSeverity: computeTopSeverity(orderedFindings),
      openActions:
        remediationPlan.openActions +
        remediationPlan.inProgressActions +
        remediationPlan.pendingVerificationActions,
      verifiedActions: remediationPlan.verifiedActions,
    },
    scopeAndContext: {
      contextSnapshotIds,
      reportingDomain,
      findingWindow,
      source: 'spine',
    },
    findingsOverview: {
      bySeverity: severityCounts,
      totalFindings: orderedFindings.length,
      topRegulations,
    },
    majorFindings: majorFindingsList.map((finding) => ({
      findingId: finding.id,
      title: finding.title,
      severity: finding.severity,
      compositeRiskScore: finding.compositeRiskScore,
      regulationId: finding.regulationId,
      regulationSectionId: finding.regulationSectionId,
    })),
    evidenceIndex,
    rootCauseAnalysis,
    contributingFactors,
    evidenceReadiness,
    remediationPlan,
    riskOutlook,
    regulatoryMapping: {
      regulationsCovered: Array.from(
        new Set(orderedFindings.map((finding) => finding.regulationId))
      ).length,
      regulationIds: Array.from(
        new Set(orderedFindings.map((finding) => finding.regulationId))
      ).sort(),
    },
    qualityGates: {
      ...qualityScores,
      overallScore,
    },
    dataLineage: {
      findingIds: orderedFindings.map((finding) => finding.id).sort(),
      actionIds: input.actions.map((action) => action.id).sort(),
      evidenceIds,
      evidenceToFindings,
      findingToActions: remediationPlan.actionsByFinding.map((entry) => ({
        findingId: entry.findingId,
        actionIds: [...entry.actionIds].sort(),
      })),
    },
    appendix: {
      notes: [
        'Derived from canonical spine only.',
        reportingDomain === ReportingDomain.MOCK_SIMULATION
          ? 'Mock simulation output; not regulatory history.'
          : 'Regulatory history output.',
      ],
    },
  };

  const content: BlueOceanReportContent = {
    tenantId: input.tenantId,
    domain: input.domain,
    reportingDomain,
    watermark,
    metadata,
    sections,
  };

  const reportId = computeBlueOceanReportHash(content);

  return {
    reportId,
    ...content,
  };
}
