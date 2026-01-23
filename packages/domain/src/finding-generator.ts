/**
 * Finding Generator (Phase 9c: Evidence)
 *
 * Generates deterministic DraftFindings from mock inspection session answers.
 * Key mechanism:
 * - Topic Catalog v1 defines expected evidence_types
 * - When expected evidence is missing, generate DraftFinding with:
 *   - origin = SYSTEM_MOCK
 *   - reporting_domain = MOCK_SIMULATION
 *   - status = DRAFT
 *   - reg_section_path from topic scope
 *   - why_hash = deterministic hash of (topic_id | missing_evidence_types | reg_section_path | prs_snapshot_hash)
 *
 * CRITICAL INVARIANT: Mock findings CANNOT be promoted to REGULATORY_HISTORY.
 */

import { createHash } from 'node:crypto';
import type {
  TenantId,
  FindingId,
  ISOTimestamp,
  ContentHash,
  EvidenceId,
  Domain,
  RegulationId,
  SnapshotId,
} from './types.js';
import {
  FindingOrigin,
  ReportingDomain,
  Severity,
} from './types.js';
import type { MockInspectionSession, TopicId, DraftFinding } from './mock-inspection-engine.js';
import type { Topic, EvidenceType, EvidenceRequest } from './topic-catalog.js';
import type { ProviderContextSnapshot } from './provider-context-snapshot.js';
import type { EvidenceRecord } from './evidence.js';
import {
  type InspectionFinding,
  createInspectionFinding,
  MockContaminationError,
} from './inspection-finding.js';

/**
 * Status for draft findings
 */
export enum DraftFindingStatus {
  DRAFT = 'DRAFT',
}

/**
 * Extended DraftFinding with additional fields for evidence tracking
 */
export interface ExtendedDraftFinding extends DraftFinding {
  // Provenance
  origin: FindingOrigin;
  reportingDomain: ReportingDomain;
  status: DraftFindingStatus;

  // Evidence tracking
  missingEvidenceTypes: EvidenceType[];
  evidenceRefs: EvidenceId[];

  // Deterministic hash
  whyHash: ContentHash;
}

/**
 * Evidence analysis result for a topic
 */
export interface TopicEvidenceAnalysis {
  topicId: TopicId;
  expectedEvidence: EvidenceRequest[];
  providedEvidence: EvidenceRecord[];
  missingEvidence: EvidenceType[];
  hasRequiredGaps: boolean;
}

/**
 * Session analysis result
 */
export interface SessionAnalysisResult {
  sessionId: string;
  topicAnalyses: TopicEvidenceAnalysis[];
  generatedFindings: ExtendedDraftFinding[];
}

/**
 * Computes deterministic why_hash for a finding.
 *
 * why_hash = sha256(
 *   topic_id |
 *   missing_evidence_types (sorted) |
 *   reg_section_path |
 *   prs_snapshot_hash
 * )
 *
 * Same inputs always produce same hash.
 */
export function computeWhyHash(params: {
  topicId: TopicId;
  missingEvidenceTypes: EvidenceType[];
  regSectionPath: string;
  prsSnapshotHash: ContentHash;
}): ContentHash {
  const canonical = {
    topicId: params.topicId,
    missingEvidenceTypes: [...params.missingEvidenceTypes].sort(),
    regSectionPath: params.regSectionPath,
    prsSnapshotHash: params.prsSnapshotHash,
  };

  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Analyzes topic evidence to identify missing evidence types.
 */
export function analyzeTopicEvidence(
  topic: Topic,
  providedEvidence: EvidenceRecord[]
): TopicEvidenceAnalysis {
  const providedTypes = new Set(providedEvidence.map((e) => e.evidenceType));
  const missingEvidence: EvidenceType[] = [];
  let hasRequiredGaps = false;

  for (const request of topic.evidenceHuntProfile.autoRequest) {
    const providedCount = providedEvidence.filter(
      (e) => e.evidenceType === request.evidenceType
    ).length;

    if (providedCount < request.minCount) {
      missingEvidence.push(request.evidenceType);
      if (request.required) {
        hasRequiredGaps = true;
      }
    }
  }

  return {
    topicId: topic.topicId,
    expectedEvidence: topic.evidenceHuntProfile.autoRequest,
    providedEvidence,
    missingEvidence,
    hasRequiredGaps,
  };
}

/**
 * Generates a DraftFinding for missing evidence in a topic.
 */
export function generateMissingEvidenceFinding(params: {
  sessionId: string;
  topicId: TopicId;
  topic: Topic;
  missingEvidenceTypes: EvidenceType[];
  contextSnapshot: ProviderContextSnapshot;
  regulationId: RegulationId;
  regSectionPath: string;
  tenantId: TenantId;
  identifiedBy: string;
}): ExtendedDraftFinding {
  // Select first regulation section path from topic scope
  const regSectionPath = params.regSectionPath;

  // Compute deterministic why_hash
  const whyHash = computeWhyHash({
    topicId: params.topicId,
    missingEvidenceTypes: params.missingEvidenceTypes,
    regSectionPath,
    prsSnapshotHash: params.contextSnapshot.snapshotHash,
  });

  // Determine severity based on number of missing evidence types
  let severity: Severity;
  const hasRequired = params.topic.evidenceHuntProfile.autoRequest.some(
    (req) => req.required && params.missingEvidenceTypes.includes(req.evidenceType)
  );

  if (hasRequired) {
    severity = Severity.HIGH;
  } else if (params.missingEvidenceTypes.length >= 3) {
    severity = Severity.MEDIUM;
  } else {
    severity = Severity.LOW;
  }

  // Compute impact and likelihood scores
  const impactScore = hasRequired ? 80 : 60;
  const likelihoodScore = 70;

  const draftedAt = new Date().toISOString();

  return {
    id: `finding-${params.sessionId}-${params.topicId}-${whyHash.substring(0, 8)}`,
    sessionId: params.sessionId,
    topicId: params.topicId,
    regulationId: params.regulationId,
    regulationSectionId: regSectionPath,
    title: `Missing Evidence: ${params.topic.title}`,
    description: `Missing required evidence types: ${params.missingEvidenceTypes.join(', ')}`,
    severity,
    impactScore,
    likelihoodScore,
    draftedAt,
    draftedBy: params.identifiedBy,
    origin: FindingOrigin.SYSTEM_MOCK,
    reportingDomain: ReportingDomain.MOCK_SIMULATION,
    status: DraftFindingStatus.DRAFT,
    missingEvidenceTypes: params.missingEvidenceTypes,
    evidenceRefs: [],
    whyHash,
  };
}

/**
 * Analyzes a mock inspection session and generates DraftFindings for missing evidence.
 */
export function analyzeSessionForFindings(params: {
  session: MockInspectionSession;
  topics: Map<TopicId, Topic>;
  providedEvidenceByTopic: Map<TopicId, EvidenceRecord[]>;
  contextSnapshot: ProviderContextSnapshot;
  tenantId: TenantId;
}): SessionAnalysisResult {
  const topicAnalyses: TopicEvidenceAnalysis[] = [];
  const generatedFindings: ExtendedDraftFinding[] = [];

  // Analyze each topic in the session
  for (const [topicId, topicState] of params.session.topicStates) {
    const topic = params.topics.get(topicId);
    if (!topic) {
      continue; // Topic not found in catalog
    }

    const providedEvidence = params.providedEvidenceByTopic.get(topicId) || [];

    // Analyze evidence gaps
    const analysis = analyzeTopicEvidence(topic, providedEvidence);
    topicAnalyses.push(analysis);

    // Generate finding if there are missing evidence types
    if (analysis.missingEvidence.length > 0) {
      // Select first regulation section path from topic scope
      const regSectionPath =
        topic.regulationScope.includeSectionPaths[0] ||
        `${topic.regulationScope.includeSectionPrefixes[0]}/*`;
      const regulationId = topic.regulationScope.regulationIds[0];

      const finding = generateMissingEvidenceFinding({
        sessionId: params.session.id,
        topicId,
        topic,
        missingEvidenceTypes: analysis.missingEvidence,
        contextSnapshot: params.contextSnapshot,
        regulationId,
        regSectionPath,
        tenantId: params.tenantId,
        identifiedBy: params.session.createdBy,
      });

      generatedFindings.push(finding);
    }
  }

  return {
    sessionId: params.session.id,
    topicAnalyses,
    generatedFindings,
  };
}

/**
 * Finalizes DraftFindings to InspectionFindings (still in MOCK_SIMULATION domain).
 * Attaches evidence refs where available.
 *
 * CRITICAL: This function maintains MOCK_SIMULATION reporting domain.
 * Attempting to promote to REGULATORY_HISTORY will throw.
 */
export function finalizeDraftFindings(params: {
  draftFindings: ExtendedDraftFinding[];
  contextSnapshotId: SnapshotId;
  domain: Domain;
  identifiedAt: ISOTimestamp;
}): InspectionFinding[] {
  const finalizedFindings: InspectionFinding[] = [];

  for (const draft of params.draftFindings) {
    // CRITICAL CHECK: Ensure we're not accidentally promoting to REGULATORY_HISTORY
    if (draft.reportingDomain !== ReportingDomain.MOCK_SIMULATION) {
      throw new MockContaminationError(
        `Cannot finalize draft finding ${draft.id} with reporting domain ${draft.reportingDomain}`
      );
    }

    // Create InspectionFinding (will enforce origin-reportingDomain consistency)
    const finding = createInspectionFinding({
      id: draft.id,
      tenantId: draft.sessionId, // Using sessionId as tenantId for now (would be extracted)
      domain: params.domain,
      origin: draft.origin,
      reportingDomain: draft.reportingDomain,
      contextSnapshotId: params.contextSnapshotId,
      regulationId: draft.regulationId,
      regulationSectionId: draft.regulationSectionId,
      title: draft.title,
      description: draft.description,
      severity: draft.severity,
      impactScore: draft.impactScore,
      likelihoodScore: draft.likelihoodScore,
      identifiedAt: params.identifiedAt,
      identifiedBy: draft.draftedBy,
    });

    finalizedFindings.push(finding);
  }

  return finalizedFindings;
}

/**
 * Attempts to promote a mock finding to REGULATORY_HISTORY.
 * This function MUST throw - it's a security boundary.
 *
 * @throws {MockContaminationError} Always throws
 */
export function promoteMockFindingToRegulatory(
  finding: InspectionFinding
): InspectionFinding {
  if (finding.origin === FindingOrigin.SYSTEM_MOCK) {
    throw new MockContaminationError(
      'SYSTEM_MOCK findings cannot be promoted to REGULATORY_HISTORY'
    );
  }

  // This code should never execute for mock findings
  return {
    ...finding,
    reportingDomain: ReportingDomain.REGULATORY_HISTORY,
  };
}
