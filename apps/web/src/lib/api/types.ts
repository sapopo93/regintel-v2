/**
 * API Types for RegIntel UI
 *
 * Re-exports backend types for type-safe API communication.
 * UI never defines its own domain types - it imports from backend.
 */

/**
 * Constitutional metadata - required on all API responses
 */
export interface ConstitutionalMetadata {
  topicCatalogVersion: string;
  topicCatalogHash: string;
  prsLogicVersion: string;
  prsLogicHash: string;
  snapshotTimestamp: string;
  domain: 'CQC' | 'IMMIGRATION';
  reportingDomain: 'MOCK_SIMULATION' | 'REGULATORY_HISTORY';
}

/**
 * Provider
 */
export interface Provider {
  providerId: string;
  providerName: string;
  orgRef?: string;
  asOf: string;
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
  mime?: string;
  size?: number;
  mimeType: string;
  sizeBytes: number;
  evidenceType: string;
  fileName: string;
  description?: string;
  uploadedAt: string;
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
}

/**
 * Provider overview response
 */
export interface ProviderOverviewResponse extends ConstitutionalMetadata {
  provider: ProviderContextSnapshot;
  facility?: Facility;
  evidenceCoverage: number;
  topicsCompleted: number;
  totalTopics: number;
  unansweredQuestions: number;
  openFindings: number;
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
  | 'BLUE_OCEAN_AUDIT';

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
  facilityHash: string;
  createdAt: string;
  createdBy: string;
  asOf: string;
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

export interface CreateFacilityEvidenceRequest {
  facilityId: string;
  blobHash: string;
  evidenceType: string;
  fileName: string;
  description?: string;
}

export interface CreateFacilityEvidenceResponse extends ConstitutionalMetadata {
  record: EvidenceRecord;
}
