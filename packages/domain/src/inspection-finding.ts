/**
 * InspectionFinding Entity (Phase 1: The Spine)
 *
 * Represents inspection findings with strict mock/regulatory separation.
 * IMMUTABLE: Once created, findings cannot be modified.
 * CRITICAL INVARIANT: SYSTEM_MOCK findings NEVER appear in REGULATORY_HISTORY.
 */

import { createHash } from 'node:crypto';
import {
  FindingOrigin,
  ReportingDomain,
  Severity,
  Domain,
  type TenantId,
  type FindingId,
  type SnapshotId,
  type RegulationId,
  type ISOTimestamp,
  type ContentHash,
} from './types.js';

export interface InspectionFinding {
  // Identity
  id: FindingId;
  tenantId: TenantId;
  domain: Domain;

  // Provenance (CRITICAL for separation)
  origin: FindingOrigin; // Where this finding came from
  reportingDomain: ReportingDomain; // Which domain it belongs to

  // Context (temporal safety)
  contextSnapshotId: SnapshotId; // REQUIRED: All findings reference a snapshot

  // Regulation reference
  regulationId: RegulationId;
  regulationSectionId: string;

  // Finding details
  title: string;
  description: string;
  severity: Severity;

  // Scoring (deterministic)
  impactScore: number; // 0-100
  likelihoodScore: number; // 0-100
  compositeRiskScore: number; // Computed from impact * likelihood

  // Integrity
  provenanceHash: ContentHash; // Hash of provenance + context + regulation ref

  // Lifecycle
  identifiedAt: ISOTimestamp;
  identifiedBy: string; // User or "SYSTEM" for mock inspections
  createdAt: ISOTimestamp;
}

/**
 * Computes a deterministic provenance hash for a finding.
 * Used to detect duplicate findings and verify integrity.
 */
export function computeProvenanceHash(finding: {
  origin: FindingOrigin;
  reportingDomain: ReportingDomain;
  contextSnapshotId: SnapshotId;
  regulationId: RegulationId;
  regulationSectionId: string;
  title: string;
  description: string;
  domain: Domain;
}): ContentHash {
  const canonical = {
    domain: finding.domain,
    origin: finding.origin,
    reportingDomain: finding.reportingDomain,
    contextSnapshotId: finding.contextSnapshotId,
    regulationId: finding.regulationId,
    regulationSectionId: finding.regulationSectionId,
    title: finding.title,
    description: finding.description,
  };

  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Computes composite risk score from impact and likelihood.
 */
export function computeCompositeRiskScore(impact: number, likelihood: number): number {
  if (impact < 0 || impact > 100 || likelihood < 0 || likelihood > 100) {
    throw new Error('Impact and likelihood must be between 0 and 100');
  }
  return Math.round((impact * likelihood) / 100);
}

/**
 * Creates a new inspection finding.
 * Automatically computes provenance hash and composite risk score.
 * ENFORCES: origin-reportingDomain consistency.
 */
export function createInspectionFinding(input: {
  id: FindingId;
  tenantId: TenantId;
  domain: Domain;
  origin: FindingOrigin;
  reportingDomain: ReportingDomain;
  contextSnapshotId: SnapshotId;
  regulationId: RegulationId;
  regulationSectionId: string;
  title: string;
  description: string;
  severity: Severity;
  impactScore: number;
  likelihoodScore: number;
  identifiedAt: ISOTimestamp;
  identifiedBy: string;
}): InspectionFinding {
  // CRITICAL SECURITY CHECK: SYSTEM_MOCK cannot enter REGULATORY_HISTORY
  if (
    input.origin === FindingOrigin.SYSTEM_MOCK &&
    input.reportingDomain === ReportingDomain.REGULATORY_HISTORY
  ) {
    throw new MockContaminationError(
      'SYSTEM_MOCK findings cannot be placed in REGULATORY_HISTORY'
    );
  }

  // ACTUAL_INSPECTION and SELF_IDENTIFIED must go to REGULATORY_HISTORY
  if (
    (input.origin === FindingOrigin.ACTUAL_INSPECTION ||
      input.origin === FindingOrigin.SELF_IDENTIFIED) &&
    input.reportingDomain !== ReportingDomain.REGULATORY_HISTORY
  ) {
    throw new Error(
      'ACTUAL_INSPECTION and SELF_IDENTIFIED findings must be in REGULATORY_HISTORY'
    );
  }

  const provenanceHash = computeProvenanceHash({
    origin: input.origin,
    reportingDomain: input.reportingDomain,
    contextSnapshotId: input.contextSnapshotId,
    regulationId: input.regulationId,
    regulationSectionId: input.regulationSectionId,
    title: input.title,
    description: input.description,
    domain: input.domain,
  });

  const compositeRiskScore = computeCompositeRiskScore(
    input.impactScore,
    input.likelihoodScore
  );

  return {
    id: input.id,
    tenantId: input.tenantId,
    domain: input.domain,
    origin: input.origin,
    reportingDomain: input.reportingDomain,
    contextSnapshotId: input.contextSnapshotId,
    regulationId: input.regulationId,
    regulationSectionId: input.regulationSectionId,
    title: input.title,
    description: input.description,
    severity: input.severity,
    impactScore: input.impactScore,
    likelihoodScore: input.likelihoodScore,
    compositeRiskScore,
    provenanceHash,
    identifiedAt: input.identifiedAt,
    identifiedBy: input.identifiedBy,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Verifies that a finding's provenance hash matches its provenance.
 */
export function verifyFindingIntegrity(finding: InspectionFinding): boolean {
  const expectedHash = computeProvenanceHash({
    origin: finding.origin,
    reportingDomain: finding.reportingDomain,
    contextSnapshotId: finding.contextSnapshotId,
    regulationId: finding.regulationId,
    regulationSectionId: finding.regulationSectionId,
    title: finding.title,
    description: finding.description,
    domain: finding.domain,
  });

  return finding.provenanceHash === expectedHash;
}

/**
 * Error thrown when attempting to place mock findings in regulatory history.
 */
export class MockContaminationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MockContaminationError';
  }
}
