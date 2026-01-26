/**
 * Blue Ocean Markdown renderers (Phase 11)
 *
 * Deterministic, presentation-only renderers for Board and Audit packs.
 * Renderers must not recompute business logic or mutate the report spine.
 */

import { ReportingDomain } from './types.js';
import type { BlueOceanReport, BlueOceanActionDetail } from './blue-ocean-report.js';

const BOARD_WATERMARK = 'BLUE OCEAN (MOCK) \u2014 NOT REGULATORY HISTORY';
const REGULATORY_WATERMARK = 'BLUE OCEAN \u2014 REGULATORY HISTORY';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatHumanDate(isoTimestamp: string | null): string {
  if (!isoTimestamp) return 'Not specified';
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return 'Not specified';
  const day = date.getUTCDate();
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

function toReferenceCode(reportId: string): string {
  return reportId.slice(0, 8);
}

function assuranceStatus(score: number): string {
  return score >= 95 ? 'Verified' : score >= 80 ? 'On track' : 'Needs attention';
}

function formatActionStatus(detail: BlueOceanActionDetail): string {
  switch (detail.status) {
    case 'OPEN':
      return 'Open';
    case 'IN_PROGRESS':
      return 'In progress';
    case 'PENDING_VERIFICATION':
      return 'Pending verification';
    case 'VERIFIED_CLOSED':
      return 'Verified closed';
    case 'REJECTED':
      return 'Rejected';
    default:
      return detail.status;
  }
}

function formatVerificationMethod(detail: BlueOceanActionDetail): string {
  return detail.verificationEvidenceIds.length > 0 ? 'Evidence review' : 'Not specified';
}

function resolveBoardHeader(report: BlueOceanReport): string {
  return report.reportingDomain === ReportingDomain.MOCK_SIMULATION
    ? BOARD_WATERMARK
    : REGULATORY_WATERMARK;
}

function buildGoldenThreads(report: BlueOceanReport): Array<{
  evidenceTitle: string;
  findingTitle: string;
  causeSummary: string;
  actionSummary: string;
  verificationMethod: string;
  status: string;
}> {
  const findings = report.sections.majorFindings;
  const rcaMap = new Map(
    report.sections.rootCauseAnalysis.map((analysis) => [analysis.findingId, analysis])
  );
  const actionMap = new Map<string, BlueOceanActionDetail[]>();
  for (const action of report.sections.remediationPlan.actionDetails) {
    const list = actionMap.get(action.findingId) ?? [];
    list.push(action);
    actionMap.set(action.findingId, list);
  }

  const evidenceMap = new Map<string, string>();
  for (const evidence of report.sections.evidenceIndex) {
    for (const findingId of evidence.supportsFindingIds) {
      if (!evidenceMap.has(findingId)) {
        evidenceMap.set(findingId, evidence.title);
      }
    }
  }
  const evidenceFallback = report.sections.evidenceIndex.map((entry) => entry.title);

  const threads: Array<{
    evidenceTitle: string;
    findingTitle: string;
    causeSummary: string;
    actionSummary: string;
    verificationMethod: string;
    status: string;
  }> = [];

  for (const finding of findings.slice(0, 3)) {
    const rca = rcaMap.get(finding.findingId);
    const hypothesis = rca?.hypotheses[0]?.hypothesis ?? 'Root cause under review';
    const actions = actionMap.get(finding.findingId) ?? [];
    const primaryAction = actions[0];
    const actionSummary = primaryAction
      ? `${primaryAction.description} (Owner: ${primaryAction.ownerRole ?? 'Unassigned'})`
      : 'Action not yet assigned';

    const evidenceTitle =
      evidenceMap.get(finding.findingId) ??
      evidenceFallback[i] ??
      evidenceFallback[0] ??
      'No evidence recorded';

    threads.push({
      evidenceTitle,
      findingTitle: finding.title,
      causeSummary: hypothesis,
      actionSummary,
      verificationMethod: primaryAction ? formatVerificationMethod(primaryAction) : 'Not specified',
      status: primaryAction ? formatActionStatus(primaryAction) : 'Not started',
    });
  }

  return threads;
}

export function serializeBlueOceanBoardMarkdown(report: BlueOceanReport): string {
  const lines: string[] = [];
  const header = resolveBoardHeader(report);
  const snapshotDate = formatHumanDate(report.metadata.snapshotTimestamp);
  const reportType =
    report.reportingDomain === ReportingDomain.MOCK_SIMULATION
      ? 'Mock Inspection Simulation'
      : 'Regulatory History Review';

  lines.push(`# ${header}`);
  lines.push('');
  lines.push(`Reference Code: ${toReferenceCode(report.reportId)}`);
  lines.push(`Report Date: ${snapshotDate}`);
  lines.push(`Report Type: ${reportType}`);
  lines.push('');

  lines.push('## How we know we\u2019re safe');
  lines.push('');
  const gates = report.sections.qualityGates;
  lines.push(`- Verified Integrity: ${assuranceStatus(gates.determinismScore)}`);
  lines.push(`- Traceability: ${assuranceStatus(gates.domainConsistencyScore)}`);
  lines.push(`- Consistency: ${assuranceStatus(gates.rcaCoverageScore)}`);
  lines.push(`- Safety: ${assuranceStatus(gates.mockWatermarkScore)}`);
  lines.push('');

  lines.push('## Executive Summary');
  lines.push('');
  const exec = report.sections.executiveSummary;
  lines.push(`- Total findings: ${exec.totalFindings}`);
  lines.push(`- Major findings: ${exec.majorFindings}`);
  lines.push(`- Highest severity: ${exec.topSeverity ?? 'None'}`);
  lines.push(`- Open actions: ${exec.openActions}`);
  lines.push(`- Verified actions: ${exec.verifiedActions}`);
  lines.push('');

  lines.push('## Priority Findings');
  lines.push('');
  if (report.sections.majorFindings.length === 0) {
    lines.push('No major findings were identified in this assessment.');
  } else {
    for (const finding of report.sections.majorFindings) {
      lines.push(`- ${finding.title} (${finding.severity})`);
    }
  }
  lines.push('');

  lines.push('## Action Plan');
  lines.push('');
  if (report.sections.remediationPlan.actionDetails.length === 0) {
    lines.push('No actions have been recorded yet.');
  } else {
    lines.push('| Action | Owner Role | Deadline | Verification Method | Status |');
    lines.push('|--------|------------|----------|----------------------|--------|');
    for (const action of report.sections.remediationPlan.actionDetails) {
      const owner = action.ownerRole ?? 'Unassigned';
      const deadline = formatHumanDate(action.targetCompletionDate);
      const verification = formatVerificationMethod(action);
      const status = formatActionStatus(action);
      lines.push(
        `| ${action.description} | ${owner} | ${deadline} | ${verification} | ${status} |`
      );
    }
  }
  lines.push('');

  lines.push('## Golden Thread examples');
  lines.push('');
  const threads = buildGoldenThreads(report);
  for (let i = 0; i < threads.length; i += 1) {
    const thread = threads[i];
    lines.push(`### Golden Thread ${i + 1}`);
    lines.push(`- Evidence: ${thread.evidenceTitle}`);
    lines.push(`- Finding: ${thread.findingTitle}`);
    lines.push(`- Cause: ${thread.causeSummary}`);
    lines.push(`- Action: ${thread.actionSummary}`);
    lines.push(`- Verification: ${thread.verificationMethod}`);
    lines.push(`- Status: ${thread.status}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function serializeBlueOceanAuditMarkdown(report: BlueOceanReport): string {
  const lines: string[] = [];
  lines.push('# Blue Ocean Report (Audit Pack)');
  lines.push('');
  lines.push(`watermark=${report.watermark ?? 'none'}`);
  lines.push(`reportId=${report.reportId}`);
  lines.push(`domain=${report.domain}`);
  lines.push(`reportingDomain=${report.reportingDomain}`);
  lines.push('');

  lines.push('## Constitutional Metadata');
  lines.push('');
  lines.push(`topicCatalogVersion=${report.metadata.topicCatalogVersion}`);
  lines.push(`topicCatalogHash=${report.metadata.topicCatalogHash}`);
  lines.push(`prsLogicProfilesVersion=${report.metadata.prsLogicProfilesVersion}`);
  lines.push(`prsLogicProfilesHash=${report.metadata.prsLogicProfilesHash}`);
  lines.push(`snapshotTimestamp=${report.metadata.snapshotTimestamp ?? 'null'}`);
  lines.push('');

  lines.push('## Executive Summary');
  lines.push('');
  const exec = report.sections.executiveSummary;
  lines.push(`totalFindings=${exec.totalFindings}`);
  lines.push(`majorFindings=${exec.majorFindings}`);
  lines.push(`topSeverity=${exec.topSeverity ?? 'None'}`);
  lines.push(`openActions=${exec.openActions}`);
  lines.push(`verifiedActions=${exec.verifiedActions}`);
  lines.push('');

  lines.push('## Findings Overview');
  lines.push('');
  const overview = report.sections.findingsOverview;
  lines.push(`totalFindings=${overview.totalFindings}`);
  lines.push('bySeverity=');
  for (const [severity, count] of Object.entries(overview.bySeverity)) {
    lines.push(`- ${severity}:${count}`);
  }
  lines.push('topRegulations=');
  for (const reg of overview.topRegulations) {
    lines.push(`- ${reg.regulationId}:${reg.findingsCount}`);
  }
  lines.push('');

  lines.push('## Major Findings');
  lines.push('');
  for (const finding of report.sections.majorFindings) {
    lines.push(
      `findingId=${finding.findingId} severity=${finding.severity} risk=${finding.compositeRiskScore} regulation=${finding.regulationId} section=${finding.regulationSectionId}`
    );
  }
  lines.push('');

  lines.push('## Evidence Index');
  lines.push('');
  if (report.sections.evidenceIndex.length === 0) {
    lines.push('evidence=none');
  } else {
    lines.push('| evidenceRef | evidenceId | evidenceType | title | collectedAt | primaryBlobHash | supportsFindingIds |');
    lines.push('|-------------|------------|--------------|-------|-------------|-----------------|--------------------|');
    for (const entry of report.sections.evidenceIndex) {
      lines.push(
        `| ${entry.evidenceRef} | ${entry.evidenceId} | ${entry.evidenceType} | ${entry.title} | ${entry.collectedAt} | ${entry.primaryBlobHash} | ${entry.supportsFindingIds.join(', ')} |`
      );
    }
  }
  lines.push('');

  lines.push('## Root Cause Analysis');
  lines.push('');
  for (const rca of report.sections.rootCauseAnalysis) {
    lines.push(`findingId=${rca.findingId}`);
    lines.push(`title=${rca.title}`);
    lines.push(`severity=${rca.severity}`);
    for (let i = 0; i < rca.hypotheses.length; i += 1) {
      const hypothesis = rca.hypotheses[i];
      lines.push(`hypothesis_${i + 1}=${hypothesis.hypothesis}`);
      lines.push(`rationale_${i + 1}=${hypothesis.rationale}`);
      lines.push(`confidence_${i + 1}=${hypothesis.confidence}`);
      lines.push(`disconfirmingTests_${i + 1}=${hypothesis.disconfirmingTests.join(' | ')}`);
    }
    lines.push('');
  }

  lines.push('## Remediation Plan');
  lines.push('');
  const remediation = report.sections.remediationPlan;
  lines.push(`openActions=${remediation.openActions}`);
  lines.push(`inProgressActions=${remediation.inProgressActions}`);
  lines.push(`pendingVerificationActions=${remediation.pendingVerificationActions}`);
  lines.push(`verifiedActions=${remediation.verifiedActions}`);
  lines.push(`rejectedActions=${remediation.rejectedActions}`);
  lines.push('actionsByFinding=');
  for (const entry of remediation.actionsByFinding) {
    lines.push(`- ${entry.findingId}:${entry.actionIds.join(', ')}`);
  }
  lines.push('');
  if (remediation.actionDetails.length > 0) {
    lines.push('| actionId | findingId | description | ownerRole | targetCompletionDate | status | verificationEvidenceIds |');
    lines.push('|----------|-----------|-------------|----------|----------------------|--------|-------------------------|');
    for (const action of remediation.actionDetails) {
      lines.push(
        `| ${action.actionId} | ${action.findingId} | ${action.description} | ${action.ownerRole ?? 'null'} | ${action.targetCompletionDate ?? 'null'} | ${action.status} | ${action.verificationEvidenceIds.join(', ')} |`
      );
    }
    lines.push('');
  }

  lines.push('## Risk Outlook');
  lines.push('');
  const risk = report.sections.riskOutlook;
  lines.push(`highestCompositeRiskScore=${risk.highestCompositeRiskScore}`);
  lines.push(`averageCompositeRiskScore=${risk.averageCompositeRiskScore}`);
  lines.push('riskTierBreakdown=');
  for (const [tier, count] of Object.entries(risk.riskTierBreakdown)) {
    lines.push(`- ${tier}:${count}`);
  }
  lines.push('');

  lines.push('## Regulatory Mapping');
  lines.push('');
  const mapping = report.sections.regulatoryMapping;
  lines.push(`regulationsCovered=${mapping.regulationsCovered}`);
  lines.push(`regulationIds=${mapping.regulationIds.join(', ')}`);
  lines.push('');

  lines.push('## Quality Gates');
  lines.push('');
  const gates = report.sections.qualityGates;
  lines.push(`rcaCoverageScore=${gates.rcaCoverageScore}`);
  lines.push(`mockWatermarkScore=${gates.mockWatermarkScore}`);
  lines.push(`domainConsistencyScore=${gates.domainConsistencyScore}`);
  lines.push(`determinismScore=${gates.determinismScore}`);
  lines.push(`overallScore=${gates.overallScore}`);
  lines.push('');

  lines.push('## Data Lineage');
  lines.push('');
  const lineage = report.sections.dataLineage;
  lines.push(`findingIds=${lineage.findingIds.join(', ')}`);
  lines.push(`actionIds=${lineage.actionIds.join(', ')}`);
  lines.push(`evidenceIds=${lineage.evidenceIds.join(', ')}`);
  lines.push('evidenceToFindings=');
  for (const entry of lineage.evidenceToFindings) {
    lines.push(`- ${entry.evidenceId}:${entry.supportsFindingIds.join(', ')}`);
  }
  lines.push('findingToActions=');
  for (const entry of lineage.findingToActions) {
    lines.push(`- ${entry.findingId}:${entry.actionIds.join(', ')}`);
  }
  lines.push('');

  lines.push('## Appendix');
  lines.push('');
  for (const note of report.sections.appendix.notes) {
    lines.push(`- ${note}`);
  }
  lines.push('');

  return lines.join('\n');
}
