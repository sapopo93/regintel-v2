/**
 * API Types for RegIntel UI
 *
 * Re-exports backend types for type-safe API communication.
 * UI never defines its own domain types - it imports from backend.
 */

/**
 * Constitutional metadata - required on all API responses
 */
export type ReportMode = 'REAL' | 'MOCK';
export type IngestionStatus = 'NO_SOURCE' | 'INGESTION_INCOMPLETE' | 'READY';

export interface ReportSource {
  type: 'cqc_upload' | 'mock';
  id: string;
  asOf: string;
  inspectionStatus?: string;
  lastReportScrapedAt?: string | null;
  lastScrapedReportDate?: string;
  cqcSyncedAt?: string | null;
  dataSource?: string;
}

export interface ConstitutionalMetadata {
  topicCatalogVersion: string;
  topicCatalogHash: string;
  prsLogicVersion: string;
  prsLogicHash: string;
  snapshotTimestamp: string;
  domain: 'CQC' | 'IMMIGRATION';
  reportingDomain: 'MOCK_SIMULATION' | 'REGULATORY_HISTORY';
  mode: ReportMode;
  reportSource: ReportSource;
  snapshotId: string;
  ingestionStatus: IngestionStatus;
}

/**
 * Provider
 */
export interface Provider {
  providerId: string;
  providerName: string;
  orgRef?: string;
  asOf: string;
  inspectionStatus?: string;
  lastReportScrapedAt?: string | null;
  lastScrapedReportDate?: string;
  cqcSyncedAt?: string | null;
  dataSource?: string;
  prsState: string;
  registeredBeds: number;
  serviceTypes: string[];
}

/**
 * Provider context snapshot
 */
export interface ProviderContextSnapshot {
  providerId: string;
  providerName: string;
  asOf: string;
  inspectionStatus?: string;
  lastReportScrapedAt?: string | null;
  lastScrapedReportDate?: string;
  cqcSyncedAt?: string | null;
  dataSource?: string;
  prsState: string;
  registeredBeds: number;
  serviceTypes: string[];
}

/**
 * Topic from catalog
 */
export interface Topic {
  id: string;
  title: string;
  regulationSectionId: string;
  evidenceRequirements: string[];
  questionMode: 'evidence_first' | 'narrative_first' | 'contradiction_hunt';
  maxFollowUps: number;
}

/**
 * Mock inspection session
 */
export interface MockInspectionSession {
  sessionId: string;
  providerId: string;
  facilityId: string;
  mode: ReportMode;
  providerSnapshot: ProviderContextSnapshot;
  topicId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  followUpsUsed: number;
  maxFollowUps: number;
  createdAt: string;
  completedAt?: string;
  topicCatalogVersion: string;
  topicCatalogHash: string;
  prsLogicProfilesVersion: string;
  prsLogicProfilesHash: string;
}

/**
 * Inspection finding
 */
export interface InspectionFinding {
  id: string;
  regulationSectionId: string;
  topicId: string;
  origin: 'SYSTEM_MOCK' | 'ACTUAL_INSPECTION' | 'SELF_IDENTIFIED';
  reportingDomain: 'MOCK_SIMULATION' | 'REGULATORY_HISTORY';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  compositeRiskScore: number;
  title: string;
  description: string;
  evidenceRequired: string[];
  evidenceProvided: string[];
  evidenceMissing: string[];
  deterministicHash: string;
  createdAt: string;
}

/**
 * Evidence record
 */
export interface EvidenceRecord {
  evidenceRecordId: string;
  providerId: string;
  facilityId: string;
  blobHash: string;
  mimeType: string;
  sizeBytes: number;
  evidenceType: string;
  fileName: string;
  description?: string;
  uploadedAt: string;
  expiresAt?: string;
  documentAudit?: DocumentAuditSummary;
}

export interface DocumentAuditResult {
  documentType: string;
  auditDate: string;
  overallResult: 'PASS' | 'NEEDS_IMPROVEMENT' | 'CRITICAL_GAPS';
  complianceScore: number;
  safStatements: Array<{
    statementId: string;
    statementName: string;
    rating: 'MET' | 'PARTIALLY_MET' | 'NOT_MET' | 'NOT_APPLICABLE';
    evidence: string;
  }>;
  findings: Array<{
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    category: string;
    description: string;
    regulatoryReference?: string;
    regulation?: string;
    safStatement?: string;
  }>;
  corrections: Array<{
    finding: string;
    correction: string;
    policyReference: string;
    priority: 'IMMEDIATE' | 'THIS_WEEK' | 'THIS_MONTH';
    exampleWording?: string;
  }>;
  summary: string;
}

export interface DocumentAuditSummary {
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  evidenceRecordId: string;
  documentType?: string;
  originalFileName?: string;
  overallResult?: 'PASS' | 'NEEDS_IMPROVEMENT' | 'CRITICAL_GAPS';
  complianceScore?: number;
  criticalFindings?: number;
  highFindings?: number;
  summary?: string;
  auditedAt?: string;
  failureReason?: string;
  result?: DocumentAuditResult;
}

/**
 * Audit event
 */
export interface AuditEvent {
  eventId: string;
  eventType: string;
  timestamp: string;
  userId: string;
  payloadHash: string;
  previousEventHash?: string;
  eventHash: string;
  payload?: Record<string, unknown>;
}

/**
 * Update facility request (partial)
 */
export interface UpdateFacilityRequest {
  facilityName?: string;
  addressLine1?: string;
  townCity?: string;
  postcode?: string;
  serviceType?: string;
  capacity?: number;
}

/**
 * Provider overview response
 */
export interface ProviderOverviewResponse extends ConstitutionalMetadata {
  provider: ProviderContextSnapshot;
  facility?: Facility;
  evidenceCoverage: number;
  evidenceCount?: number;
  documentUploadPercentage?: number;
  topicsCompleted: number;
  totalTopics: number;
  unansweredQuestions: number;
  openFindings: number;
  requiredEvidenceTypes?: string[];
  readinessWeights?: { evidence: number; mockCoverage: number };
}

/**
 * Topics list response
 */
export interface TopicsListResponse extends ConstitutionalMetadata {
  topics: Topic[];
  completionStatus: Record<string, { completed: number; total: number }>;
}

/**
 * Finding detail response
 */
export interface FindingDetailResponse extends ConstitutionalMetadata {
  finding: InspectionFinding;
  regulationText: string;
  policyClause?: string;
}

/**
 * Evidence list response
 */
export interface EvidenceListResponse extends ConstitutionalMetadata {
  evidence: EvidenceRecord[];
  totalCount: number;
}

/**
 * Supported export formats
 */
export type ExportFormat =
  | 'CSV'
  | 'PDF'
  | 'BLUE_OCEAN'
  | 'BLUE_OCEAN_BOARD'
  | 'BLUE_OCEAN_AUDIT'
  | 'INSPECTOR_PACK';

/**
 * Export generation request
 */
export interface ExportRequest {
  facilityId: string;
  format: ExportFormat;
  includeWatermark: boolean;
}

/**
 * Export response
 */
export interface ExportResponse extends ConstitutionalMetadata {
  exportId: string;
  downloadUrl: string;
  expiresAt: string;
}

/**
 * Export status response
 */
export interface ExportStatusResponse extends ConstitutionalMetadata {
  providerId: string;
  availableFormats: Array<ExportFormat>;
  watermark: string;
  latestExport?: {
    exportId: string;
    format: ExportFormat;
    generatedAt: string;
  };
}

/**
 * Providers list response
 */
export interface ProvidersListResponse extends ConstitutionalMetadata {
  providers: Provider[];
}

/**
 * Create provider request
 */
export interface CreateProviderRequest {
  providerName: string;
  orgRef?: string;
}

/**
 * Provider detail response
 */
export interface ProviderDetailResponse extends ConstitutionalMetadata {
  provider: Provider;
}

/**
 * Mock sessions list response
 */
export interface MockSessionsListResponse extends ConstitutionalMetadata {
  sessions: MockInspectionSession[];
}

/**
 * Findings list response
 */
export interface FindingsListResponse extends ConstitutionalMetadata {
  findings: InspectionFinding[];
  totalCount: number;
}

/**
 * Audit trail response
 */
export interface AuditTrailResponse extends ConstitutionalMetadata {
  events: AuditEvent[];
  totalCount: number;
}

/**
 * Facility
 */
export interface Facility {
  id: string;
  tenantId: string;
  providerId: string;
  facilityName: string;
  addressLine1: string;
  townCity: string;
  postcode: string;
  address: string;
  cqcLocationId: string;
  serviceType: string;
  capacity?: number;
  latestRating?: string;
  facilityHash: string;
  createdAt: string;
  createdBy: string;
  asOf: string;
  inspectionStatus?: string;
  lastReportScrapedAt?: string | null;
  lastScrapedReportDate?: string;
  cqcSyncedAt?: string | null;
  dataSource?: string;
}

/**
 * Facilities list response
 */
export interface FacilitiesListResponse extends ConstitutionalMetadata {
  provider?: Provider;
  facilities: Facility[];
  totalCount: number;
}

/**
 * Facility detail response
 */
export interface FacilityDetailResponse extends ConstitutionalMetadata {
  provider?: Provider;
  facility: Facility;
}

/**
 * Create facility request
 */
export interface CreateFacilityRequest {
  providerId: string;
  facilityName: string;
  addressLine1: string;
  townCity: string;
  postcode: string;
  cqcLocationId: string;
  serviceType: string;
  capacity?: number;
}

/**
 * Onboard facility request (auto-populate from CQC API)
 */
export interface OnboardFacilityRequest {
  providerId: string;
  cqcLocationId: string;
  // Optional overrides
  facilityName?: string;
  addressLine1?: string;
  townCity?: string;
  postcode?: string;
  serviceType?: string;
  capacity?: number;
}

/**
 * CQC Location data from API
 */
export interface CqcLocationData {
  locationId: string;
  name: string;
  postalCode?: string;
  postalAddressLine1?: string;
  postalAddressTownCity?: string;
  registrationStatus: string;
  type: string;
  numberOfBeds?: number;
  currentRatings?: {
    overall?: {
      rating: string;
      reportDate?: string;
    };
  };
}

/**
 * CQC location lookup response (lightweight, no facility creation)
 */
export interface CqcLocationLookupResponse extends ConstitutionalMetadata {
  found: boolean;
  data?: CqcLocationData;
  error?: {
    code: string;
    message: string;
    statusCode?: number;
  };
}

/**
 * Onboard facility response (includes CQC data)
 */
export interface OnboardFacilityResponse extends ConstitutionalMetadata {
  facility: Facility;
  cqcData: CqcLocationData | null;
  isNew: boolean;
  dataSource: 'CQC_API' | 'MANUAL';
  syncedAt: string;
}

/**
 * Scan status for evidence blobs
 */
export type ScanStatus = 'PENDING' | 'CLEAN' | 'INFECTED';

/**
 * Upload evidence request
 */
export interface CreateEvidenceBlobRequest {
  contentBase64: string;
  mimeType: string;
}

export interface CreateEvidenceBlobResponse extends ConstitutionalMetadata {
  blobHash: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface CreateEvidenceBlobResponseWithScan extends CreateEvidenceBlobResponse {
  scanStatus: ScanStatus;
  scanJobId: string;
}

export interface CreateFacilityEvidenceRequest {
  facilityId: string;
  blobHash: string;
  evidenceType: string;
  fileName: string;
  description?: string;
  expiresAt?: string;
}

export interface CreateFacilityEvidenceResponse extends ConstitutionalMetadata {
  record: EvidenceRecord;
}

export interface DocumentAuditResponse extends ConstitutionalMetadata, DocumentAuditSummary {}

/**
 * Malware scan response
 */
export interface MalwareScanResponse extends ConstitutionalMetadata {
  contentHash: string;
  status: ScanStatus;
  scannedAt: string;
  threats: string[];
  scanJobId: string;
}

/**
 * Background job response
 */
export interface BackgroundJobResponse extends ConstitutionalMetadata {
  jobId: string;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  createdAt: string;
  processedAt?: string;
}

/**
 * AI insights response
 */
export interface AIInsightsResponse extends ConstitutionalMetadata {
  sessionId: string;
  insights: unknown;
  jobId?: string;
  status: 'ready' | 'processing' | 'failed';
}

/**
 * Sync latest CQC report response
 */
export interface SyncReportResponse extends ConstitutionalMetadata {
  jobId: string;
  status: string;
  message: string;
}

/**
 * SAF 34 Coverage types
 */
export interface Saf34QualityStatementCoverage {
  id: string;
  keyQuestion: string;
  title: string;
  covered: boolean;
  matchingTopicIds: string[];
}

export interface Saf34KeyQuestionSummary {
  keyQuestion: string;
  label: string;
  total: number;
  covered: number;
  percentage: number;
}

export interface Saf34CoverageResponse extends ConstitutionalMetadata {
  statements: Saf34QualityStatementCoverage[];
  keyQuestions: Saf34KeyQuestionSummary[];
  overall: {
    total: number;
    covered: number;
    percentage: number;
  };
}

/**
 * Provider dashboard (Feature 1: Compliance Command Centre)
 */
export interface FacilitySummary {
  facilityId: string;
  facilityName: string;
  serviceType?: string;
  capacity?: number;
  readinessScore: number;
  evidenceCoverage: number;
  evidenceCount: number;
  applicableTopicCount?: number;
  requiredEvidenceTypes?: string[];
  readinessColorThresholds?: { red: number; amber: number };
  findingsBySeverity: { critical: number; high: number; medium: number; low: number };
  lastEvidenceUploadDate: string | null;
  lastMockSessionDate: string | null;
  completedMockSessions: number;
  needsAttention: boolean;
  attentionReasons: string[];
}

export interface ProviderDashboardResponse extends ConstitutionalMetadata {
  providerId: string;
  providerName: string;
  facilities: FacilitySummary[];
  totals: {
    facilities: number;
    averageReadiness: number;
    totalFindings: { critical: number; high: number; medium: number; low: number };
    facilitiesNeedingAttention: number;
  };
  expiringEvidence: ExpiringEvidenceItem[];
}

/**
 * Evidence Intelligence (Feature 2: Expiry Tracking)
 */
export interface ExpiringEvidenceItem {
  evidenceRecordId: string;
  facilityId: string;
  facilityName: string;
  fileName: string;
  evidenceType: string;
  expiresAt: string;
  daysUntilExpiry: number;
  isOverdue: boolean;
}

export interface ExpiringEvidenceResponse extends ConstitutionalMetadata {
  items: ExpiringEvidenceItem[];
  totalCount: number;
}

/**
 * Readiness Journey (Feature 3: Guided Onboarding)
 */
export interface ReadinessStep {
  id: string;
  label: string;
  description: string;
  status: 'complete' | 'in-progress' | 'not-started';
  actionLabel?: string;
  actionHref?: string;
}

export interface ReadinessJourneyResponse extends ConstitutionalMetadata {
  facilityId: string;
  facilityName: string;
  steps: ReadinessStep[];
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  nextRecommendedAction?: {
    label: string;
    href: string;
    reason: string;
  };
}

/**
 * Bulk onboard request
 */
export interface BulkOnboardRequest {
  providerId: string;
  cqcLocationIds: string[];
  autoSyncReports?: boolean;
}

/**
 * Bulk onboard response
 */
export interface BulkOnboardResponse extends ConstitutionalMetadata {
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
  results: Array<{
    cqcLocationId: string;
    success: boolean;
    facility?: Facility;
    error?: string;
  }>;
  backgroundJobsQueued: number;
}

/**
 * CQC Intelligence (Feature 1)
 */
export type IntelligenceType = 'RISK_SIGNAL' | 'OUTSTANDING_SIGNAL';
export type AlertSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CqcIntelligenceAlert {
  id: string;
  intelligenceType: IntelligenceType;
  sourceLocationName: string;
  sourceServiceType: string;
  reportDate: string;
  keyQuestion: string;
  qualityStatementId: string;
  qualityStatementTitle: string;
  findingText: string;
  providerCoveragePercent: number;
  severity: AlertSeverity;
  createdAt: string;
}

export interface CqcIntelligenceResponse extends ConstitutionalMetadata {
  alerts: CqcIntelligenceAlert[];
  summary: {
    riskCount: number;
    outstandingCount: number;
  };
}

export interface CqcPollResponse extends ConstitutionalMetadata {
  alertsGenerated: number;
  locationsProcessed: number;
  locationsSkipped: number;
}
