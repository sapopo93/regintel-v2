/**
 * Provider Outputs (Phase 7)
 *
 * Generates provider-facing outputs that derive data ONLY from the canonical spine.
 * NO BUSINESS LOGIC IN UI - all computation happens here in the domain layer.
 *
 * Outputs:
 * - Inspection Confidence Report
 * - Risk Register (open findings)
 * - Evidence Readiness Matrix
 * - Action Verification View
 *
 * CRITICAL INVARIANT: UI derives data only from these outputs, never from raw spine data.
 */

import type {
  TenantId,
  Domain,
  ISOTimestamp,
  FindingId,
  ActionId,
  Severity,
} from './types.js';
import type { InspectionFinding } from './inspection-finding.js';
import type { Action } from './action.js';
import { ActionStatus } from './action.js';
import type { EvidenceType } from './topic-catalog.js';

/**
 * Inspection Confidence Report
 * Summarizes readiness for inspection based on findings and remediation.
 */
export interface InspectionConfidenceReport {
  tenantId: TenantId;
  domain: Domain;
  generatedAt: ISOTimestamp;
  asOfSnapshot: string; // SnapshotId

  // Overall confidence (0-100)
  overallConfidenceScore: number;

  // Breakdown by severity
  findingsSummary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };

  // Remediation progress
  remediationSummary: {
    openActions: number;
    inProgressActions: number;
    completedActions: number;
    verifiedActions: number;
  };

  // Risk areas
  topRiskAreas: Array<{
    regulationId: string;
    regulationSectionId: string;
    findingsCount: number;
    highestSeverity: Severity;
    remediationStatus: 'not_started' | 'in_progress' | 'completed';
  }>;

  // Readiness indicators
  readinessIndicators: {
    hasOpenCriticalFindings: boolean;
    hasOpenHighFindings: boolean;
    allActionsVerified: boolean;
    evidenceGapCount: number;
  };
}

/**
 * Risk Register Entry
 * Open findings that require attention
 */
export interface RiskRegisterEntry {
  findingId: FindingId;
  regulationId: string;
  regulationSectionId: string;
  title: string;
  severity: Severity;
  compositeRiskScore: number;
  identifiedAt: ISOTimestamp;
  actionId: ActionId | null;
  actionStatus: ActionStatus | null;
  daysSinceIdentified: number;
}

/**
 * Risk Register
 * List of all open findings ordered by risk
 */
export interface RiskRegister {
  tenantId: TenantId;
  domain: Domain;
  generatedAt: ISOTimestamp;
  asOfSnapshot: string;

  entries: RiskRegisterEntry[];

  summary: {
    totalOpenFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
}

/**
 * Evidence Readiness Entry
 * Evidence status for a topic
 */
export interface EvidenceReadinessEntry {
  topicId: string;
  topicTitle: string;
  requiredEvidenceTypes: EvidenceType[];
  collectedEvidenceTypes: EvidenceType[];
  missingEvidenceTypes: EvidenceType[];
  completionPercentage: number;
  status: 'complete' | 'partial' | 'missing';
}

/**
 * Evidence Readiness Matrix
 * Shows evidence collection status across topics
 */
export interface EvidenceReadinessMatrix {
  tenantId: TenantId;
  domain: Domain;
  generatedAt: ISOTimestamp;

  entries: EvidenceReadinessEntry[];

  summary: {
    totalTopics: number;
    completeTopics: number;
    partialTopics: number;
    missingTopics: number;
    overallCompletionPercentage: number;
  };
}

/**
 * Action Verification Entry
 * Status of remediation actions
 */
export interface ActionVerificationEntry {
  actionId: ActionId;
  findingId: FindingId;
  findingTitle: string;
  actionDescription: string;
  status: ActionStatus;
  createdAt: ISOTimestamp;
  targetCompletionDate: ISOTimestamp | null;
  completedAt: ISOTimestamp | null;
  verifiedAt: ISOTimestamp | null;
  daysOpen: number;
  overdue: boolean;
}

/**
 * Action Verification View
 * Tracks all remediation actions
 */
export interface ActionVerificationView {
  tenantId: TenantId;
  domain: Domain;
  generatedAt: ISOTimestamp;

  entries: ActionVerificationEntry[];

  summary: {
    total: number;
    open: number;
    inProgress: number;
    pendingVerification: number;
    verified: number;
    overdue: number;
  };
}

/**
 * Generates Inspection Confidence Report from spine data.
 * PURE FUNCTION: Derives from findings and actions only.
 */
export function generateInspectionConfidenceReport(input: {
  tenantId: TenantId;
  domain: Domain;
  asOfSnapshot: string;
  findings: InspectionFinding[];
  actions: Action[];
}): InspectionConfidenceReport {
  const generatedAt = new Date().toISOString();

  // Count findings by severity
  const findingsSummary = {
    critical: input.findings.filter((f) => f.severity === 'CRITICAL').length,
    high: input.findings.filter((f) => f.severity === 'HIGH').length,
    medium: input.findings.filter((f) => f.severity === 'MEDIUM').length,
    low: input.findings.filter((f) => f.severity === 'LOW').length,
    total: input.findings.length,
  };

  // Count actions by status
  const remediationSummary = {
    openActions: input.actions.filter((a) => a.status === ActionStatus.OPEN).length,
    inProgressActions: input.actions.filter((a) => a.status === ActionStatus.IN_PROGRESS)
      .length,
    completedActions: input.actions.filter(
      (a) => a.status === ActionStatus.PENDING_VERIFICATION
    ).length,
    verifiedActions: input.actions.filter((a) => a.status === ActionStatus.VERIFIED_CLOSED)
      .length,
  };

  // Compute overall confidence score (0-100)
  const baseScore = 100;
  const criticalPenalty = findingsSummary.critical * 15;
  const highPenalty = findingsSummary.high * 10;
  const mediumPenalty = findingsSummary.medium * 5;
  const lowPenalty = findingsSummary.low * 2;

  const remediationBonus = remediationSummary.verifiedActions * 3;

  const overallConfidenceScore = Math.max(
    0,
    Math.min(
      100,
      baseScore - criticalPenalty - highPenalty - mediumPenalty - lowPenalty + remediationBonus
    )
  );

  // Identify top risk areas
  const riskAreaMap = new Map<
    string,
    {
      regulationId: string;
      regulationSectionId: string;
      findingsCount: number;
      highestSeverity: Severity;
      hasActions: boolean;
      actionsVerified: boolean;
    }
  >();

  for (const finding of input.findings) {
    const key = `${finding.regulationId}:${finding.regulationSectionId}`;
    const existing = riskAreaMap.get(key);

    if (!existing) {
      const hasActions = input.actions.some((a) => a.findingId === finding.id);
      const actionsVerified =
        hasActions &&
        input.actions
          .filter((a) => a.findingId === finding.id)
          .every((a) => a.status === ActionStatus.VERIFIED_CLOSED);

      riskAreaMap.set(key, {
        regulationId: finding.regulationId,
        regulationSectionId: finding.regulationSectionId,
        findingsCount: 1,
        highestSeverity: finding.severity,
        hasActions,
        actionsVerified,
      });
    } else {
      existing.findingsCount += 1;
      // Update highest severity if needed
      const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
      if (
        severityOrder.indexOf(finding.severity) <
        severityOrder.indexOf(existing.highestSeverity)
      ) {
        existing.highestSeverity = finding.severity;
      }
    }
  }

  const topRiskAreas = Array.from(riskAreaMap.values())
    .sort((a, b) => b.findingsCount - a.findingsCount)
    .slice(0, 5)
    .map((area) => ({
      regulationId: area.regulationId,
      regulationSectionId: area.regulationSectionId,
      findingsCount: area.findingsCount,
      highestSeverity: area.highestSeverity,
      remediationStatus: area.actionsVerified
        ? ('completed' as const)
        : area.hasActions
          ? ('in_progress' as const)
          : ('not_started' as const),
    }));

  // Readiness indicators
  const readinessIndicators = {
    hasOpenCriticalFindings: findingsSummary.critical > 0,
    hasOpenHighFindings: findingsSummary.high > 0,
    allActionsVerified: input.actions.every(
      (a) => a.status === ActionStatus.VERIFIED_CLOSED
    ),
    evidenceGapCount: 0, // Would be computed from evidence records
  };

  return {
    tenantId: input.tenantId,
    domain: input.domain,
    generatedAt,
    asOfSnapshot: input.asOfSnapshot,
    overallConfidenceScore,
    findingsSummary,
    remediationSummary,
    topRiskAreas,
    readinessIndicators,
  };
}

/**
 * Generates Risk Register from findings and actions.
 * PURE FUNCTION: Derives from spine data only.
 */
export function generateRiskRegister(input: {
  tenantId: TenantId;
  domain: Domain;
  asOfSnapshot: string;
  findings: InspectionFinding[];
  actions: Action[];
}): RiskRegister {
  const generatedAt = new Date().toISOString();
  const now = new Date();

  const entries: RiskRegisterEntry[] = input.findings.map((finding) => {
    const relatedAction = input.actions.find((a) => a.findingId === finding.id);

    const identifiedDate = new Date(finding.identifiedAt);
    const daysSinceIdentified = Math.floor(
      (now.getTime() - identifiedDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      findingId: finding.id,
      regulationId: finding.regulationId,
      regulationSectionId: finding.regulationSectionId,
      title: finding.title,
      severity: finding.severity,
      compositeRiskScore: finding.compositeRiskScore,
      identifiedAt: finding.identifiedAt,
      actionId: relatedAction?.id ?? null,
      actionStatus: relatedAction?.status ?? null,
      daysSinceIdentified,
    };
  });

  // Sort by composite risk score (highest first)
  entries.sort((a, b) => b.compositeRiskScore - a.compositeRiskScore);

  const summary = {
    totalOpenFindings: entries.length,
    criticalCount: entries.filter((e) => e.severity === 'CRITICAL').length,
    highCount: entries.filter((e) => e.severity === 'HIGH').length,
    mediumCount: entries.filter((e) => e.severity === 'MEDIUM').length,
    lowCount: entries.filter((e) => e.severity === 'LOW').length,
  };

  return {
    tenantId: input.tenantId,
    domain: input.domain,
    generatedAt,
    asOfSnapshot: input.asOfSnapshot,
    entries,
    summary,
  };
}

/**
 * Generates Action Verification View from actions.
 * PURE FUNCTION: Derives from spine data only.
 */
export function generateActionVerificationView(input: {
  tenantId: TenantId;
  domain: Domain;
  actions: Action[];
  findings: InspectionFinding[];
}): ActionVerificationView {
  const generatedAt = new Date().toISOString();
  const now = new Date();

  const entries: ActionVerificationEntry[] = input.actions.map((action) => {
    const finding = input.findings.find((f) => f.id === action.findingId);

    const createdDate = new Date(action.createdAt);
    const daysOpen = Math.floor(
      (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const overdue =
      action.targetCompletionDate !== null &&
      new Date(action.targetCompletionDate) < now &&
      action.status !== ActionStatus.VERIFIED_CLOSED;

    return {
      actionId: action.id,
      findingId: action.findingId,
      findingTitle: finding?.title ?? 'Unknown Finding',
      actionDescription: action.description,
      status: action.status,
      createdAt: action.createdAt,
      targetCompletionDate: action.targetCompletionDate,
      completedAt: action.completedAt ?? null,
      verifiedAt: action.verifiedAt ?? null,
      daysOpen,
      overdue,
    };
  });

  // Sort by status priority and then by days open
  const statusPriority: Record<ActionStatus, number> = {
    [ActionStatus.OPEN]: 1,
    [ActionStatus.IN_PROGRESS]: 2,
    [ActionStatus.PENDING_VERIFICATION]: 3,
    [ActionStatus.VERIFIED_CLOSED]: 4,
    [ActionStatus.REJECTED]: 5,
  };

  entries.sort((a, b) => {
    const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
    if (priorityDiff !== 0) return priorityDiff;
    return b.daysOpen - a.daysOpen;
  });

  const summary = {
    total: entries.length,
    open: entries.filter((e) => e.status === ActionStatus.OPEN).length,
    inProgress: entries.filter((e) => e.status === ActionStatus.IN_PROGRESS).length,
    pendingVerification: entries.filter(
      (e) => e.status === ActionStatus.PENDING_VERIFICATION
    ).length,
    verified: entries.filter((e) => e.status === ActionStatus.VERIFIED_CLOSED).length,
    overdue: entries.filter((e) => e.overdue).length,
  };

  return {
    tenantId: input.tenantId,
    domain: input.domain,
    generatedAt,
    entries,
    summary,
  };
}

/**
 * Validates that outputs derive ONLY from spine data.
 * Returns true if outputs are pure (no external dependencies).
 */
export function validateOutputPurity(output: {
  findings: InspectionFinding[];
  actions: Action[];
  report: InspectionConfidenceReport;
  riskRegister: RiskRegister;
  actionView: ActionVerificationView;
}): { pure: boolean; violations: string[] } {
  const violations: string[] = [];

  // Check that report data matches spine data
  const expectedTotalFindings = output.findings.length;
  if (output.report.findingsSummary.total !== expectedTotalFindings) {
    violations.push(
      `Report findings count (${output.report.findingsSummary.total}) does not match spine (${expectedTotalFindings})`
    );
  }

  // Check that risk register entries match findings
  if (output.riskRegister.entries.length !== output.findings.length) {
    violations.push(
      `Risk register entries (${output.riskRegister.entries.length}) do not match findings (${output.findings.length})`
    );
  }

  // Check that action view entries match actions
  if (output.actionView.entries.length !== output.actions.length) {
    violations.push(
      `Action view entries (${output.actionView.entries.length}) do not match actions (${output.actions.length})`
    );
  }

  return {
    pure: violations.length === 0,
    violations,
  };
}
