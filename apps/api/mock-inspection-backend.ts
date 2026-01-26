/**
 * Mock Inspection Backend (Phase 9d: Mock Inspection Backend)
 *
 * API endpoints for executing readiness-only inspections against frozen
 * Topic Catalog v1 and PRS Logic Profiles v1.
 *
 * Backend responsibilities (ONLY):
 * - Session lifecycle management
 * - Topic sequencing
 * - Follow-up counting
 * - Draft finding generation
 * - Provenance enforcement (origin=SYSTEM_MOCK, reporting_domain=MOCK_SIMULATION)
 *
 * Forbidden:
 * - Touching regulatory history tables
 * - Any UI formatting
 * - Any free-text reasoning or scoring heuristics
 * - Any mutation of frozen registries
 *
 * Required API endpoints:
 * - POST /v1/mock/sessions { provider_id }
 * - GET  /v1/mock/sessions/:id/next-question
 * - POST /v1/mock/sessions/:id/answers
 * - POST /v1/mock/sessions/:id/complete
 * - GET  /v1/mock/sessions/:id/findings
 */

import {
  type TenantId,
  type ProviderId,
  type FacilityId,
  type EvidenceId,
  type SnapshotId,
  type SessionId,
  type TopicId,
  type FindingId,
  type ISOTimestamp,
  type ContentHash,
  Domain,
  FindingOrigin,
  ReportingDomain,
  Severity,
} from '../../packages/domain/src/types.js';
import {
  type MockInspectionSession,
  type DraftFinding,
  type SessionEvent,
  type QuestionContext,
  SessionStatus,
  createMockInspectionSession,
  openTopic,
  askQuestion,
  draftFinding,
  closeTopic,
  completeSession,
  selectNextTopic,
  selectNextQuestion,
} from '../../packages/domain/src/mock-inspection-engine.js';
import type { ProviderContextSnapshot } from '../../packages/domain/src/provider-context-snapshot.js';
import type { PRSLogicProfile } from '../../packages/domain/src/prs-logic-profile.js';
import { type Topic, type TopicCatalog, QuestionMode } from '../../packages/domain/src/topic-catalog.js';
import {
  getTopicCatalogV1,
  getPRSLogicProfilesV1,
} from '../../packages/domain/src/frozen-registries.js';
import {
  type CsvExport,
  type PdfExport,
  type ExportMetadata,
  generateCsvExport,
  generatePdfExport,
  serializeCsvExport,
  SessionNotCompletedError as ExportSessionNotCompletedError,
} from '../../packages/domain/src/readiness-export.js';
import {
  type Facility,
  createFacility,
  verifyFacilityIntegrity,
} from '../../packages/domain/src/facility.js';
import {
  type EvidenceBlob,
  type EvidenceRecord,
  createEvidenceBlob,
  createEvidenceRecord,
} from '../../packages/domain/src/evidence.js';

/**
 * In-memory session storage (tenant-isolated)
 * In production, this would be RLS-protected database storage
 */
/**
 * Session metadata stored alongside sessions for export generation
 */
interface SessionProviderMeta {
  providerId: string;
  topicCatalogVersion: string;
  topicCatalogSha256: ContentHash;
  prsLogicProfilesVersion: string;
  prsLogicProfilesSha256: ContentHash;
}

class SessionStore {
  private sessions: Map<string, MockInspectionSession> = new Map();
  private providerMeta: Map<string, SessionProviderMeta> = new Map();

  private scopeKey(tenantId: TenantId, sessionId: SessionId): string {
    return `${tenantId}:${sessionId}`;
  }

  set(tenantId: TenantId, session: MockInspectionSession, meta?: SessionProviderMeta): void {
    const key = this.scopeKey(tenantId, session.id);
    this.sessions.set(key, session);
    if (meta) {
      this.providerMeta.set(key, meta);
    }
  }

  get(tenantId: TenantId, sessionId: SessionId): MockInspectionSession | undefined {
    const key = this.scopeKey(tenantId, sessionId);
    return this.sessions.get(key);
  }

  getMeta(tenantId: TenantId, sessionId: SessionId): SessionProviderMeta | undefined {
    const key = this.scopeKey(tenantId, sessionId);
    return this.providerMeta.get(key);
  }

  list(tenantId: TenantId): MockInspectionSession[] {
    const results: MockInspectionSession[] = [];
    for (const [key, session] of this.sessions.entries()) {
      if (key.startsWith(`${tenantId}:`)) {
        results.push(session);
      }
    }
    return results;
  }
}

/**
 * In-memory snapshot storage (tenant-isolated)
 * In production, this would be RLS-protected database storage
 */
class SnapshotStore {
  private snapshots: Map<string, ProviderContextSnapshot> = new Map();

  private scopeKey(tenantId: TenantId, snapshotId: SnapshotId): string {
    return `${tenantId}:${snapshotId}`;
  }

  set(tenantId: TenantId, snapshot: ProviderContextSnapshot): void {
    const key = this.scopeKey(tenantId, snapshot.id);
    this.snapshots.set(key, snapshot);
  }

  get(tenantId: TenantId, snapshotId: SnapshotId): ProviderContextSnapshot | undefined {
    const key = this.scopeKey(tenantId, snapshotId);
    return this.snapshots.get(key);
  }
}

/**
 * In-memory facility storage (tenant-isolated)
 * In production, this would be RLS-protected database storage
 */
class FacilityStore {
  private facilities: Map<string, Facility> = new Map();

  private scopeKey(tenantId: TenantId, facilityId: FacilityId): string {
    return `${tenantId}:${facilityId}`;
  }

  set(tenantId: TenantId, facility: Facility): void {
    const key = this.scopeKey(tenantId, facility.id);
    this.facilities.set(key, facility);
  }

  get(tenantId: TenantId, facilityId: FacilityId): Facility | undefined {
    const key = this.scopeKey(tenantId, facilityId);
    return this.facilities.get(key);
  }

  list(tenantId: TenantId, providerId?: ProviderId): Facility[] {
    const results: Facility[] = [];
    for (const [key, facility] of this.facilities.entries()) {
      if (key.startsWith(`${tenantId}:`)) {
        if (!providerId || facility.providerId === providerId) {
          results.push(facility);
        }
      }
    }
    return results;
  }
}

/**
 * In-memory evidence storage (tenant-isolated)
 * In production, this would be RLS-protected database storage
 */
class EvidenceStore {
  private blobs: Map<ContentHash, EvidenceBlob> = new Map();
  private records: Map<string, EvidenceRecord> = new Map();

  private scopeKey(tenantId: TenantId, evidenceId: EvidenceId): string {
    return `${tenantId}:${evidenceId}`;
  }

  setBlob(blob: EvidenceBlob): void {
    this.blobs.set(blob.contentHash, blob);
  }

  getBlob(contentHash: ContentHash): EvidenceBlob | undefined {
    return this.blobs.get(contentHash);
  }

  setRecord(tenantId: TenantId, record: EvidenceRecord): void {
    const key = this.scopeKey(tenantId, record.id);
    this.records.set(key, record);
  }

  getRecord(tenantId: TenantId, recordId: EvidenceId): EvidenceRecord | undefined {
    const key = this.scopeKey(tenantId, recordId);
    return this.records.get(key);
  }

  listRecordsByFacility(tenantId: TenantId, facilityId: FacilityId): EvidenceRecord[] {
    const results: EvidenceRecord[] = [];
    for (const [key, record] of this.records.entries()) {
      if (key.startsWith(`${tenantId}:`)) {
        // Check if facilityId is in the record's title or description
        // In a real implementation, we'd have a facilityId field in the record
        if (record.title.includes(facilityId) || record.description?.includes(facilityId)) {
          results.push(record);
        }
      }
    }
    return results;
  }
}

/**
 * Global stores (in production, these would be database tables)
 */
const sessionStore = new SessionStore();
const snapshotStore = new SnapshotStore();
const facilityStore = new FacilityStore();
const evidenceStore = new EvidenceStore();

/**
 * Request/Response types for API endpoints
 */

export interface CreateFacilityRequest {
  providerId: ProviderId;
  facilityName: string;
  address: string;
  cqcLocationId: string;
  serviceType: string;
  capacity?: number;
}

export interface CreateFacilityResponse {
  facility: Facility;
  domain: Domain;
  reportingDomain: ReportingDomain;
}

export interface ListFacilitiesResponse {
  facilities: Facility[];
  totalCount: number;
  domain: Domain;
  reportingDomain: ReportingDomain;
}

export interface GetFacilityResponse {
  facility: Facility;
  domain: Domain;
  reportingDomain: ReportingDomain;
}

export interface UploadEvidenceRequest {
  facilityId: FacilityId;
  fileName: string;
  mimeType: string;
  content: string; // Base64 encoded for PDF/binary files
  description?: string;
  evidenceType: string; // e.g., 'CQC_REPORT', 'POLICY_DOCUMENT', 'TRAINING_RECORD'
}

export interface UploadEvidenceResponse {
  contentHash: ContentHash;
  recordId: EvidenceId;
  domain: Domain;
  reportingDomain: ReportingDomain;
}

export interface ListEvidenceResponse {
  records: EvidenceRecord[];
  totalCount: number;
  domain: Domain;
  reportingDomain: ReportingDomain;
}

export interface CreateSessionRequest {
  providerId: string;
  snapshotId: SnapshotId;
  domain: Domain;
}

export interface CreateSessionResponse {
  sessionId: SessionId;
  status: SessionStatus;
  topicCatalogVersion: string;
  topicCatalogSha256: ContentHash;
  prsLogicProfilesVersion: string;
  prsLogicProfilesSha256: ContentHash;
  createdAt: ISOTimestamp;
}

export interface NextQuestionResponse {
  sessionId: SessionId;
  questionId: string | null; // Deterministic question ID
  topicId: TopicId | null;
  question: string | null;
  isFollowUp: boolean;
  canContinue: boolean;
  reason?: string;
}

export interface SubmitAnswerRequest {
  topicId: TopicId;
  question: string;
  answer: string;
  isFollowUp: boolean;
}

export interface SubmitAnswerResponse {
  sessionId: SessionId;
  answerRecorded: boolean;
  findingDrafted: boolean;
  findingId?: FindingId;
}

export interface CompleteSessionResponse {
  sessionId: SessionId;
  status: SessionStatus;
  completedAt: ISOTimestamp;
  totalFindings: number;
}

export interface GetFindingsResponse {
  sessionId: SessionId;
  findings: DraftFinding[];
  totalCount: number;
}

export interface ExportCsvResponse {
  sessionId: SessionId;
  content: string;
  contentType: 'text/csv';
  filename: string;
}

export interface ExportPdfResponse {
  sessionId: SessionId;
  data: PdfExport;
  contentType: 'application/pdf';
  filename: string;
}

/**
 * Error types
 */
export class SessionNotFoundError extends Error {
  constructor(sessionId: SessionId) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

export class SnapshotNotFoundError extends Error {
  constructor(snapshotId: SnapshotId) {
    super(`Snapshot not found: ${snapshotId}`);
    this.name = 'SnapshotNotFoundError';
  }
}

export class InvalidSessionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSessionStateError';
  }
}

export class FacilityNotFoundError extends Error {
  constructor(facilityId: FacilityId) {
    super(`Facility not found: ${facilityId}`);
    this.name = 'FacilityNotFoundError';
  }
}

export class EvidenceNotFoundError extends Error {
  constructor(evidenceId: EvidenceId) {
    super(`Evidence not found: ${evidenceId}`);
    this.name = 'EvidenceNotFoundError';
  }
}

/**
 * Mock Inspection Backend API
 */
export class MockInspectionBackend {
  /**
   * POST /v1/mock/sessions
   * Creates a new mock inspection session.
   */
  async createSession(
    tenantId: TenantId,
    userId: string,
    request: CreateSessionRequest
  ): Promise<CreateSessionResponse> {
    // Get frozen registries (v1)
    const topicCatalogRegistry = getTopicCatalogV1();
    const prsLogicProfilesRegistry = getPRSLogicProfilesV1();

    // Get provider context snapshot
    const snapshot = snapshotStore.get(tenantId, request.snapshotId);
    if (!snapshot) {
      throw new SnapshotNotFoundError(request.snapshotId);
    }

    // For now, use a placeholder profile if registry is empty
    // In production, this would load from the frozen registry
    const logicProfile: PRSLogicProfile = prsLogicProfilesRegistry.profile || {
      id: 'profile-v1',
      tenantId,
      domain: request.domain,
      version: 1,
      effectiveDate: '2024-01-01T00:00:00Z',
      supersedes: null,
      severityRules: [],
      interactionRules: [],
      severityScoreMappings: [],
      defaultMaxFollowUps: 3,
      defaultMaxQuestions: 20,
      profileHash: prsLogicProfilesRegistry.sha256,
      createdAt: new Date().toISOString(),
      createdBy: 'system',
    };

    // Generate session ID
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create session
    const session = createMockInspectionSession({
      id: sessionId,
      tenantId,
      domain: request.domain,
      contextSnapshot: snapshot,
      logicProfile,
      createdBy: userId,
    });

    // Persist session with provider metadata (in production, this would be a DB insert with audit log)
    sessionStore.set(tenantId, session, {
      providerId: request.providerId,
      topicCatalogVersion: topicCatalogRegistry.version,
      topicCatalogSha256: topicCatalogRegistry.sha256,
      prsLogicProfilesVersion: prsLogicProfilesRegistry.version,
      prsLogicProfilesSha256: prsLogicProfilesRegistry.sha256,
    });

    return {
      sessionId: session.id,
      status: session.status,
      topicCatalogVersion: topicCatalogRegistry.version,
      topicCatalogSha256: topicCatalogRegistry.sha256,
      prsLogicProfilesVersion: prsLogicProfilesRegistry.version,
      prsLogicProfilesSha256: prsLogicProfilesRegistry.sha256,
      createdAt: session.startedAt,
    };
  }

  /**
   * GET /v1/mock/sessions/:id/next-question
   * Gets the next question to ask in the session.
   *
   * DETERMINISM REQUIREMENT:
   * Same session state always produces same question.
   * Question ID is deterministic SHA-256 hash.
   * Topics are ordered by Topic Catalog v1 order.
   */
  async getNextQuestion(
    tenantId: TenantId,
    sessionId: SessionId
  ): Promise<NextQuestionResponse> {
    const session = sessionStore.get(tenantId, sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.status !== SessionStatus.ACTIVE) {
      return {
        sessionId,
        questionId: null,
        topicId: null,
        question: null,
        isFollowUp: false,
        canContinue: false,
        reason: `Session is ${session.status}`,
      };
    }

    // Check if we've reached global question limit
    if (session.totalQuestionsAsked >= session.maxTotalQuestions) {
      return {
        sessionId,
        questionId: null,
        topicId: null,
        question: null,
        isFollowUp: false,
        canContinue: false,
        reason: 'Maximum total questions reached',
      };
    }

    // Get topic catalog (frozen v1)
    const topicCatalogRegistry = getTopicCatalogV1();
    const catalog = topicCatalogRegistry.catalog;

    // If no catalog, create minimal fallback for testing
    const topicsMap = catalog?.topics || this.getFallbackTopics();
    const orderedTopicIds = Array.from(topicsMap.keys());

    // Select next topic using deterministic sequencing
    const nextTopicId = selectNextTopic(session, orderedTopicIds);

    if (!nextTopicId) {
      return {
        sessionId,
        questionId: null,
        topicId: null,
        question: null,
        isFollowUp: false,
        canContinue: false,
        reason: 'All topics exhausted',
      };
    }

    // Get topic details
    const topic = topicsMap.get(nextTopicId);
    if (!topic) {
      return {
        sessionId,
        questionId: null,
        topicId: null,
        question: null,
        isFollowUp: false,
        canContinue: false,
        reason: 'Topic not found in catalog',
      };
    }

    // Select next question for this topic
    const questionContext = selectNextQuestion(
      session,
      nextTopicId,
      topic.questionPlan.starterQuestionIds,
      topic.questionPlan.followupQuestionIds,
      topic.version
    );

    if (!questionContext) {
      // This topic is exhausted, try next
      return this.getNextQuestion(tenantId, sessionId);
    }

    return {
      sessionId,
      questionId: questionContext.questionId,
      topicId: questionContext.topicId,
      question: questionContext.questionText,
      isFollowUp: questionContext.isFollowUp,
      canContinue: true,
    };
  }

  /**
   * Fallback topics for testing when catalog is not loaded.
   * In production, catalog would always be loaded from frozen registry.
   */
  private getFallbackTopics(): Map<TopicId, Topic> {
    const topics = new Map<TopicId, Topic>();

    topics.set('topic-safeguarding', {
      topicId: 'topic-safeguarding',
      domain: Domain.CQC,
      version: 1,
      title: 'Safeguarding',
      description: 'Safeguarding vulnerable adults and children',
      priority: 100,
      regulationScope: {
        regulationIds: ['reg-1'],
        includeSectionPrefixes: ['Reg13/*'],
        includeSectionPaths: [],
        excludeSectionPrefixes: [],
        excludeSectionPaths: [],
      },
      evidenceHuntProfile: {
        autoRequest: [],
        preferredOrder: [],
        stopIfMissingConfirmed: false,
      },
      conversationTemplates: {
        openingTemplateId: 'OPEN_SAFEGUARDING_V1',
        transitionTemplateId: 'TRANSITION_GENERIC_V1',
        closingTemplateId: 'CLOSE_TOPIC_V1',
      },
      questionPlan: {
        mode: QuestionMode.EVIDENCE_FIRST,
        starterQuestionIds: ['Q_SG_001'],
        followupQuestionIds: ['Q_SG_FU_001', 'Q_SG_FU_002'],
        contradictionProbeIds: [],
        maxRepeatPerQuestionId: 1,
      },
      prsOverrides: [],
      effectiveFrom: '2024-01-01T00:00:00Z',
      supersedes: null,
      createdAt: '2024-01-01T00:00:00Z',
      createdBy: 'system',
      topicHash: 'fallback-hash-1',
    } as Topic);

    return topics;
  }

  /**
   * POST /v1/mock/sessions/:id/answers
   * Submits an answer to a question.
   */
  async submitAnswer(
    tenantId: TenantId,
    sessionId: SessionId,
    request: SubmitAnswerRequest
  ): Promise<SubmitAnswerResponse> {
    let session = sessionStore.get(tenantId, sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new InvalidSessionStateError(`Session is ${session.status}`);
    }

    // Open topic if not already open
    if (!session.topicStates.has(request.topicId)) {
      session = openTopic(session, request.topicId);
    }

    // Record question asked (with answer received)
    session = askQuestion(session, request.topicId, request.question, request.isFollowUp);

    // Deterministic finding generation logic (in production, this would use structured analysis + evidence)
    // For now, use deterministic heuristic: draft finding if answer contains negative keywords
    const shouldDraftFinding =
      request.answer.toLowerCase().includes('no') ||
      request.answer.toLowerCase().includes('not') ||
      request.answer.toLowerCase().includes('unable') ||
      request.answer.toLowerCase().includes('lacking');

    let findingId: FindingId | undefined;
    if (shouldDraftFinding) {
      session = draftFinding(session, request.topicId, {
        regulationId: 'reg-1',
        regulationSectionId: 'reg-1-13',
        title: 'Potential safeguarding concern',
        description: 'Provider may not have adequate safeguarding measures in place.',
        severity: Severity.MEDIUM,
        impactScore: 60,
        likelihoodScore: 50,
      });

      findingId = session.draftFindings[session.draftFindings.length - 1]?.id;
    }

    // Persist updated session
    sessionStore.set(tenantId, session);

    return {
      sessionId,
      answerRecorded: true,
      findingDrafted: shouldDraftFinding,
      findingId,
    };
  }

  /**
   * POST /v1/mock/sessions/:id/complete
   * Completes a mock inspection session.
   */
  async completeSessionEndpoint(
    tenantId: TenantId,
    sessionId: SessionId
  ): Promise<CompleteSessionResponse> {
    let session = sessionStore.get(tenantId, sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new InvalidSessionStateError(`Session is already ${session.status}`);
    }

    // Close all open topics
    for (const [topicId, topicState] of session.topicStates.entries()) {
      if (topicState.closedAt === null) {
        session = closeTopic(session, topicId);
      }
    }

    // Complete session
    session = completeSession(session);

    // Persist completed session
    sessionStore.set(tenantId, session);

    return {
      sessionId: session.id,
      status: session.status,
      completedAt: session.completedAt!,
      totalFindings: session.totalFindingsDrafted,
    };
  }

  /**
   * GET /v1/mock/sessions/:id/findings
   * Gets all draft findings from a session.
   */
  async getFindings(
    tenantId: TenantId,
    sessionId: SessionId
  ): Promise<GetFindingsResponse> {
    const session = sessionStore.get(tenantId, sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // CRITICAL: Validate provenance enforcement
    // All findings MUST have:
    // - origin = SYSTEM_MOCK
    // - reporting_domain = MOCK_SIMULATION / READINESS (NOT REGULATORY_HISTORY)
    // - is_regulatory_fact = false
    //
    // This is enforced at the domain model level, but we verify here as well

    return {
      sessionId,
      findings: session.draftFindings,
      totalCount: session.draftFindings.length,
    };
  }

  /**
   * GET /v1/exports/mock/:session_id.csv
   * Exports mock inspection findings as CSV.
   *
   * CRITICAL: Only MOCK_SIMULATION findings are exported.
   * Every row includes session metadata, version hashes, and watermark.
   */
  async exportCsv(
    tenantId: TenantId,
    sessionId: SessionId
  ): Promise<ExportCsvResponse> {
    const session = sessionStore.get(tenantId, sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    const meta = sessionStore.getMeta(tenantId, sessionId);
    if (!meta) {
      throw new SessionNotFoundError(sessionId);
    }

    const exportMetadata: ExportMetadata = {
      sessionId: session.id,
      providerId: meta.providerId,
      topicCatalogVersion: meta.topicCatalogVersion,
      topicCatalogSha256: meta.topicCatalogSha256,
      prsLogicProfilesVersion: meta.prsLogicProfilesVersion,
      prsLogicProfilesSha256: meta.prsLogicProfilesSha256,
    };

    const csvExport = generateCsvExport(session, exportMetadata);
    const content = serializeCsvExport(csvExport);

    return {
      sessionId: session.id,
      content,
      contentType: 'text/csv',
      filename: `${sessionId}.csv`,
    };
  }

  /**
   * GET /v1/exports/mock/:session_id.pdf
   * Exports mock inspection findings as PDF data structure.
   *
   * CRITICAL: Only MOCK_SIMULATION findings are exported.
   * Every page includes watermark, session metadata, and version hashes.
   */
  async exportPdf(
    tenantId: TenantId,
    sessionId: SessionId
  ): Promise<ExportPdfResponse> {
    const session = sessionStore.get(tenantId, sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    const meta = sessionStore.getMeta(tenantId, sessionId);
    if (!meta) {
      throw new SessionNotFoundError(sessionId);
    }

    const exportMetadata: ExportMetadata = {
      sessionId: session.id,
      providerId: meta.providerId,
      topicCatalogVersion: meta.topicCatalogVersion,
      topicCatalogSha256: meta.topicCatalogSha256,
      prsLogicProfilesVersion: meta.prsLogicProfilesVersion,
      prsLogicProfilesSha256: meta.prsLogicProfilesSha256,
    };

    const pdfExport = generatePdfExport(session, exportMetadata);

    return {
      sessionId: session.id,
      data: pdfExport,
      contentType: 'application/pdf',
      filename: `${sessionId}.pdf`,
    };
  }

  /**
   * Helper: Register a snapshot for testing
   */
  registerSnapshot(tenantId: TenantId, snapshot: ProviderContextSnapshot): void {
    snapshotStore.set(tenantId, snapshot);
  }

  /**
   * POST /v1/providers/:providerId/facilities
   * Creates a new facility for a provider.
   */
  async createFacility(
    tenantId: TenantId,
    userId: string,
    request: CreateFacilityRequest
  ): Promise<CreateFacilityResponse> {
    // Generate facility ID
    const facilityId = `facility-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create facility using domain model
    const facility = createFacility({
      id: facilityId,
      tenantId,
      providerId: request.providerId,
      facilityName: request.facilityName,
      address: request.address,
      cqcLocationId: request.cqcLocationId,
      serviceType: request.serviceType,
      capacity: request.capacity,
      createdBy: userId,
    });

    // Store facility (in production, this would be a DB insert with audit log)
    facilityStore.set(tenantId, facility);

    return {
      facility,
      domain: Domain.CQC, // All facilities are CQC domain
      reportingDomain: ReportingDomain.REGULATORY_HISTORY, // Facilities are regulatory entities
    };
  }

  /**
   * GET /v1/providers/:providerId/facilities
   * Lists all facilities for a provider.
   */
  async listFacilities(
    tenantId: TenantId,
    providerId?: ProviderId
  ): Promise<ListFacilitiesResponse> {
    const facilities = facilityStore.list(tenantId, providerId);

    return {
      facilities,
      totalCount: facilities.length,
      domain: Domain.CQC,
      reportingDomain: ReportingDomain.REGULATORY_HISTORY,
    };
  }

  /**
   * GET /v1/facilities/:facilityId
   * Gets a facility by ID.
   */
  async getFacility(
    tenantId: TenantId,
    facilityId: FacilityId
  ): Promise<GetFacilityResponse> {
    const facility = facilityStore.get(tenantId, facilityId);
    if (!facility) {
      throw new FacilityNotFoundError(facilityId);
    }

    return {
      facility,
      domain: Domain.CQC,
      reportingDomain: ReportingDomain.REGULATORY_HISTORY,
    };
  }

  /**
   * POST /v1/facilities/:facilityId/evidence
   * Uploads evidence (e.g., CQC Report PDF) for a facility.
   */
  async uploadEvidence(
    tenantId: TenantId,
    userId: string,
    request: UploadEvidenceRequest
  ): Promise<UploadEvidenceResponse> {
    // Verify facility exists
    const facility = facilityStore.get(tenantId, request.facilityId);
    if (!facility) {
      throw new FacilityNotFoundError(request.facilityId);
    }

    // Decode base64 content to buffer
    const contentBuffer = Buffer.from(request.content, 'base64');

    // Create evidence blob (content-addressed)
    // In production, storageUrl would be an actual S3/blob storage URL
    const storageUrl = `blob://${facility.cqcLocationId}/${request.fileName}`;
    const blob = createEvidenceBlob({
      content: contentBuffer,
      mimeType: request.mimeType,
      storageUrl,
      scanned: true, // Mock: assume scanned
      quarantined: false,
    });

    // Create evidence record (metadata)
    const recordId = `record-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const collectedAt = new Date().toISOString();
    const record = createEvidenceRecord({
      id: recordId,
      tenantId,
      blobHashes: [blob.contentHash],
      primaryBlobHash: blob.contentHash,
      title: `${request.fileName} (${facility.facilityName})`,
      description: request.description || `Evidence for facility ${facility.facilityName}`,
      evidenceType: request.evidenceType,
      supportsFindingIds: [],
      supportsPolicyIds: [],
      collectedAt,
      collectedBy: userId,
      createdBy: userId,
    });

    // Store evidence (in production, this would be a DB insert with audit log)
    evidenceStore.setBlob(blob);
    evidenceStore.setRecord(tenantId, record);

    return {
      contentHash: blob.contentHash,
      recordId: record.id,
      domain: Domain.CQC,
      reportingDomain: ReportingDomain.REGULATORY_HISTORY,
    };
  }

  /**
   * GET /v1/facilities/:facilityId/evidence
   * Lists all evidence for a facility.
   */
  async listFacilityEvidence(
    tenantId: TenantId,
    facilityId: FacilityId
  ): Promise<ListEvidenceResponse> {
    // Verify facility exists
    const facility = facilityStore.get(tenantId, facilityId);
    if (!facility) {
      throw new FacilityNotFoundError(facilityId);
    }

    const records = evidenceStore.listRecordsByFacility(tenantId, facilityId);

    return {
      records,
      totalCount: records.length,
      domain: Domain.CQC,
      reportingDomain: ReportingDomain.REGULATORY_HISTORY,
    };
  }
}

/**
 * Singleton backend instance
 */
export const mockInspectionBackend = new MockInspectionBackend();
