/**
 * Topic Catalog (Phase 6)
 *
 * Controls the scope and relevance of mock inspection conversations.
 * - Topics are versioned and bounded to specific regulation sections
 * - No free-text prompts - only template/question IDs
 * - Evidence requests are structured and aligned with topic definitions
 * - PRS overrides allow context-specific behavior changes
 *
 * CRITICAL INVARIANTS:
 * - Topics MUST reference valid regulation sections
 * - Evidence requests MUST align with topic definitions
 * - No ad-hoc question generation allowed
 */

import { createHash } from 'node:crypto';
import type {
  TenantId,
  Domain,
  ISOTimestamp,
  ContentHash,
  RegulationId,
  ProviderRegulatoryState,
} from './types.js';

/**
 * Unique identifier for a topic
 */
export type TopicId = string;

/**
 * Unique identifier for a catalog version
 */
export type CatalogId = string;

/**
 * Evidence type (structured enum, no free text)
 */
export enum EvidenceType {
  POLICY = 'POLICY',
  PROCEDURE = 'PROCEDURE',
  RISK_ASSESSMENT = 'RISK_ASSESSMENT',
  TRAINING_LOG = 'TRAINING_LOG',
  CERTIFICATE = 'CERTIFICATE',
  AUDIT_REPORT = 'AUDIT_REPORT',
  MEETING_MINUTES = 'MEETING_MINUTES',
  CARE_RECORD_SAMPLE = 'CARE_RECORD_SAMPLE',
  INCIDENT_LOG = 'INCIDENT_LOG',
  COMPLAINTS_LOG = 'COMPLAINTS_LOG',
  SAFETY_CHECKLIST = 'SAFETY_CHECKLIST',
  MEDICATION_RECORD_SAMPLE = 'MEDICATION_RECORD_SAMPLE',
  STAFF_FILE_SAMPLE = 'STAFF_FILE_SAMPLE',
}

/**
 * Question mode (bounded, no free-text prompts)
 */
export enum QuestionMode {
  EVIDENCE_FIRST = 'EVIDENCE_FIRST',
  NARRATIVE_FIRST = 'NARRATIVE_FIRST',
  CONTRADICTION_HUNT = 'CONTRADICTION_HUNT',
}

/**
 * Regulation scope selector - defines which regulation sections a topic covers
 */
export interface RegulationScopeSelector {
  regulationIds: RegulationId[]; // References to actual regulation documents
  includeSectionPrefixes: string[]; // e.g., ["Reg13/*", "QS/Safe/*"]
  includeSectionPaths: string[]; // Specific section paths
  excludeSectionPrefixes: string[]; // Sections to exclude
  excludeSectionPaths: string[]; // Specific exclusions
}

/**
 * Evidence request definition (aligned with topic)
 */
export interface EvidenceRequest {
  evidenceType: EvidenceType;
  minCount: number;
  required: boolean; // If true, topic cannot proceed without this evidence
  validityRule?: string; // Optional validation rule ID
}

/**
 * Evidence hunt profile - structured evidence collection
 */
export interface EvidenceHuntProfile {
  autoRequest: EvidenceRequest[]; // Evidence to request automatically
  preferredOrder: EvidenceType[]; // Order to request evidence
  stopIfMissingConfirmed: boolean; // Stop topic if required evidence missing
}

/**
 * Question plan (no free-text, only IDs)
 */
export interface QuestionPlan {
  mode: QuestionMode;
  starterQuestionIds: string[]; // IDs referencing question templates
  followupQuestionIds: string[]; // IDs for follow-up questions
  contradictionProbeIds: string[]; // IDs for contradiction detection
  maxRepeatPerQuestionId: number; // Limit repeats of same question
}

/**
 * Conversation templates (IDs only, no free-text prompts)
 */
export interface ConversationTemplates {
  openingTemplateId: string;
  transitionTemplateId: string;
  closingTemplateId: string;
}

/**
 * PRS-specific overrides for a topic
 */
export interface PRSOverride {
  whenOverlayIncludesAny: ProviderRegulatoryState[];
  override: {
    questionMode?: QuestionMode;
    maxFollowUpsPerTopic?: number;
    stopIfMissingEvidenceConfirmed?: boolean;
  };
}

/**
 * Topic definition (versioned, immutable)
 */
export interface Topic {
  // Identity
  topicId: TopicId;
  domain: Domain;
  version: number;

  // Metadata
  title: string;
  description: string;
  priority: number; // Base priority 0-100

  // Regulation scope (CRITICAL: must reference valid regulations)
  regulationScope: RegulationScopeSelector;

  // Evidence requirements
  evidenceHuntProfile: EvidenceHuntProfile;

  // Conversation control (IDs only, no prompts)
  conversationTemplates: ConversationTemplates;
  questionPlan: QuestionPlan;

  // PRS overrides
  prsOverrides: PRSOverride[];

  // Lifecycle
  effectiveFrom: ISOTimestamp;
  supersedes: TopicId | null;
  createdAt: ISOTimestamp;
  createdBy: string;

  // Integrity
  topicHash: ContentHash; // Deterministic hash for versioning
}

/**
 * Topic Catalog (versioned collection of topics)
 */
export interface TopicCatalog {
  // Identity
  id: CatalogId;
  tenantId: TenantId;
  version: number;

  // Topics
  topics: Map<TopicId, Topic>;

  // Metadata
  effectiveFrom: ISOTimestamp;
  supersedes: CatalogId | null;

  // Lifecycle
  createdAt: ISOTimestamp;
  createdBy: string;

  // Integrity
  catalogHash: ContentHash; // Hash of all topics
}

/**
 * Computes deterministic hash for a topic.
 */
export function computeTopicHash(topic: {
  topicId: TopicId;
  domain: Domain;
  version: number;
  regulationScope: RegulationScopeSelector;
  evidenceHuntProfile: EvidenceHuntProfile;
  questionPlan: QuestionPlan;
  effectiveFrom: ISOTimestamp;
}): ContentHash {
  const canonical = {
    topicId: topic.topicId,
    domain: topic.domain,
    version: topic.version,
    regulationScope: {
      regulationIds: [...topic.regulationScope.regulationIds].sort(),
      includeSectionPrefixes: [...topic.regulationScope.includeSectionPrefixes].sort(),
      includeSectionPaths: [...topic.regulationScope.includeSectionPaths].sort(),
      excludeSectionPrefixes: [...topic.regulationScope.excludeSectionPrefixes].sort(),
      excludeSectionPaths: [...topic.regulationScope.excludeSectionPaths].sort(),
    },
    evidenceHuntProfile: {
      autoRequest: topic.evidenceHuntProfile.autoRequest
        .map((req) => ({
          evidenceType: req.evidenceType,
          minCount: req.minCount,
          required: req.required,
        }))
        .sort((a, b) => a.evidenceType.localeCompare(b.evidenceType)),
      preferredOrder: [...topic.evidenceHuntProfile.preferredOrder],
      stopIfMissingConfirmed: topic.evidenceHuntProfile.stopIfMissingConfirmed,
    },
    questionPlan: {
      mode: topic.questionPlan.mode,
      starterQuestionIds: [...topic.questionPlan.starterQuestionIds].sort(),
      followupQuestionIds: [...topic.questionPlan.followupQuestionIds].sort(),
    },
    effectiveFrom: topic.effectiveFrom,
  };

  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Creates a new topic.
 */
export function createTopic(input: {
  topicId: TopicId;
  domain: Domain;
  version: number;
  title: string;
  description: string;
  priority: number;
  regulationScope: RegulationScopeSelector;
  evidenceHuntProfile: EvidenceHuntProfile;
  conversationTemplates: ConversationTemplates;
  questionPlan: QuestionPlan;
  prsOverrides: PRSOverride[];
  effectiveFrom: ISOTimestamp;
  supersedes: TopicId | null;
  createdBy: string;
}): Topic {
  const topicHash = computeTopicHash({
    topicId: input.topicId,
    domain: input.domain,
    version: input.version,
    regulationScope: input.regulationScope,
    evidenceHuntProfile: input.evidenceHuntProfile,
    questionPlan: input.questionPlan,
    effectiveFrom: input.effectiveFrom,
  });

  return {
    topicId: input.topicId,
    domain: input.domain,
    version: input.version,
    title: input.title,
    description: input.description,
    priority: input.priority,
    regulationScope: input.regulationScope,
    evidenceHuntProfile: input.evidenceHuntProfile,
    conversationTemplates: input.conversationTemplates,
    questionPlan: input.questionPlan,
    prsOverrides: input.prsOverrides,
    effectiveFrom: input.effectiveFrom,
    supersedes: input.supersedes,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    topicHash,
  };
}

/**
 * Creates a new topic catalog.
 */
export function createTopicCatalog(input: {
  id: CatalogId;
  tenantId: TenantId;
  version: number;
  topics: Topic[];
  effectiveFrom: ISOTimestamp;
  supersedes: CatalogId | null;
  createdBy: string;
}): TopicCatalog {
  const topicsMap = new Map<TopicId, Topic>();
  for (const topic of input.topics) {
    topicsMap.set(topic.topicId, topic);
  }

  const catalogHash = computeCatalogHash(input.topics);

  return {
    id: input.id,
    tenantId: input.tenantId,
    version: input.version,
    topics: topicsMap,
    effectiveFrom: input.effectiveFrom,
    supersedes: input.supersedes,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    catalogHash,
  };
}

/**
 * Computes catalog hash from all topics.
 */
export function computeCatalogHash(topics: Topic[]): ContentHash {
  const sortedHashes = topics
    .map((t) => t.topicHash)
    .sort();

  const json = JSON.stringify(sortedHashes);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Validates that a topic only references valid regulation sections.
 * Returns validation errors if any.
 */
export function validateTopicRegulationScope(
  topic: Topic,
  validRegulationIds: Set<RegulationId>,
  validSectionPaths: Set<string>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check that all referenced regulation IDs exist
  for (const regId of topic.regulationScope.regulationIds) {
    if (!validRegulationIds.has(regId)) {
      errors.push(
        `Topic ${topic.topicId} references invalid regulation ID: ${regId}`
      );
    }
  }

  // Check that included section paths are valid
  for (const sectionPath of topic.regulationScope.includeSectionPaths) {
    if (!validSectionPaths.has(sectionPath)) {
      errors.push(
        `Topic ${topic.topicId} references invalid section path: ${sectionPath}`
      );
    }
  }

  // Topic must reference at least one regulation
  if (topic.regulationScope.regulationIds.length === 0) {
    errors.push(`Topic ${topic.topicId} does not reference any regulations`);
  }

  // Topic must have at least one inclusion rule
  if (
    topic.regulationScope.includeSectionPrefixes.length === 0 &&
    topic.regulationScope.includeSectionPaths.length === 0
  ) {
    errors.push(
      `Topic ${topic.topicId} has no inclusion rules (must specify sections to cover)`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates that evidence requests align with topic definition.
 * Evidence types must be appropriate for the topic's regulatory scope.
 */
export function validateEvidenceAlignment(
  topic: Topic
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check that evidence hunt profile has requests
  if (topic.evidenceHuntProfile.autoRequest.length === 0) {
    errors.push(
      `Topic ${topic.topicId} has no evidence requests (must specify what evidence to collect)`
    );
  }

  // Check that preferred order matches auto-request evidence types
  const autoRequestTypes = new Set(
    topic.evidenceHuntProfile.autoRequest.map((req) => req.evidenceType)
  );

  for (const evidenceType of topic.evidenceHuntProfile.preferredOrder) {
    if (!autoRequestTypes.has(evidenceType)) {
      errors.push(
        `Topic ${topic.topicId} preferred order includes evidence type ${evidenceType} not in auto-request list`
      );
    }
  }

  // Check that required evidence has min_count > 0
  for (const req of topic.evidenceHuntProfile.autoRequest) {
    if (req.required && req.minCount === 0) {
      errors.push(
        `Topic ${topic.topicId} evidence ${req.evidenceType} is required but min_count is 0`
      );
    }
  }

  // Check that question plan uses IDs (not free-text)
  if (topic.questionPlan.starterQuestionIds.length === 0) {
    errors.push(
      `Topic ${topic.topicId} has no starter question IDs (must specify questions to ask)`
    );
  }

  // Validate question IDs are properly formatted (should be IDs, not prompts)
  for (const qid of topic.questionPlan.starterQuestionIds) {
    if (qid.length > 50 || qid.includes(' ') || qid.includes('\n')) {
      errors.push(
        `Topic ${topic.topicId} starter question ID "${qid}" appears to be free-text (should be an ID)`
      );
    }
  }

  for (const qid of topic.questionPlan.followupQuestionIds) {
    if (qid.length > 50 || qid.includes(' ') || qid.includes('\n')) {
      errors.push(
        `Topic ${topic.topicId} followup question ID "${qid}" appears to be free-text (should be an ID)`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates an entire topic catalog.
 */
export function validateTopicCatalog(
  catalog: TopicCatalog,
  validRegulationIds: Set<RegulationId>,
  validSectionPaths: Set<string>
): { valid: boolean; errors: string[] } {
  const allErrors: string[] = [];

  for (const topic of catalog.topics.values()) {
    // Validate regulation scope
    const scopeValidation = validateTopicRegulationScope(
      topic,
      validRegulationIds,
      validSectionPaths
    );
    allErrors.push(...scopeValidation.errors);

    // Validate evidence alignment
    const evidenceValidation = validateEvidenceAlignment(topic);
    allErrors.push(...evidenceValidation.errors);
  }

  // Catalog must have at least one topic
  if (catalog.topics.size === 0) {
    allErrors.push('Catalog has no topics');
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * Error thrown when topic validation fails.
 */
export class TopicValidationError extends Error {
  constructor(
    message: string,
    public errors: string[]
  ) {
    super(message);
    this.name = 'TopicValidationError';
  }
}
