/**
 * Type-safe API Client for RegIntel UI
 *
 * All API communication goes through this client.
 * Enforces constitutional metadata on all responses.
 */

import { ConstitutionalViolationError } from '../validators';
import type {
  ConstitutionalMetadata,
  ProviderOverviewResponse,
  TopicsListResponse,
  FindingDetailResponse,
  EvidenceListResponse,
  ExportRequest,
  ExportResponse,
  ExportStatusResponse,
  MockInspectionSession,
  ProvidersListResponse,
  MockSessionsListResponse,
  FindingsListResponse,
  AuditTrailResponse,
  Topic,
  FacilitiesListResponse,
  FacilityDetailResponse,
  CreateFacilityRequest,
  OnboardFacilityRequest,
  OnboardFacilityResponse,
  CreateProviderRequest,
  ProviderDetailResponse,
  CreateEvidenceBlobRequest,
  CreateEvidenceBlobResponseWithScan,
  CreateFacilityEvidenceRequest,
  CreateFacilityEvidenceResponse,
  BackgroundJobResponse,
  MalwareScanResponse,
  AIInsightsResponse,
  SyncReportResponse,
  BulkOnboardRequest,
  BulkOnboardResponse,
} from './types';

/**
 * API client configuration
 */
interface ApiClientConfig {
  baseUrl: string;
  tenantId?: string;
  getToken?: () => Promise<string | null>;
}

/**
 * API error response
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Validates constitutional metadata on API responses
 */
function validateConstitutionalMetadata(
  data: unknown
): asserts data is ConstitutionalMetadata {
  const metadata = data as Partial<ConstitutionalMetadata>;

  const missing: string[] = [];

  if (!metadata.topicCatalogVersion) missing.push('topicCatalogVersion');
  if (!metadata.topicCatalogHash) missing.push('topicCatalogHash');
  if (!metadata.prsLogicVersion) missing.push('prsLogicVersion');
  if (!metadata.prsLogicHash) missing.push('prsLogicHash');
  if (!metadata.snapshotTimestamp) missing.push('snapshotTimestamp');
  if (!metadata.domain) missing.push('domain');
  if (!metadata.reportingDomain) missing.push('reportingDomain');
  if (!metadata.mode) missing.push('mode');
  if (!metadata.snapshotId) missing.push('snapshotId');
  if (!metadata.ingestionStatus) missing.push('ingestionStatus');
  if (
    !metadata.reportSource ||
    !metadata.reportSource.type ||
    !metadata.reportSource.id ||
    !metadata.reportSource.asOf
  ) {
    missing.push('reportSource');
  }

  if (missing.length > 0) {
    throw new ConstitutionalViolationError(
      `API response missing constitutional metadata: ${missing.join(', ')}`,
      missing
    );
  }
}

/**
 * Type-safe API client
 */
export class ApiClient {
  constructor(private config: ApiClientConfig) { }

  /**
   * Update client configuration (e.g., to inject token provider)
   */
  updateConfig(config: Partial<ApiClientConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Generic fetch wrapper with error handling
   */
  private async fetch<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;

    // Try token provider first (Clerk)
    let authToken: string | null = null;
    if (this.config.getToken) {
      authToken = await this.config.getToken();
    }

    const response = await fetch(url, {
      ...options,
      credentials: 'include', // Send cookies for Clerk session
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(this.config.tenantId ? { 'X-Tenant-Id': this.config.tenantId } : {}),
        ...options?.headers,
      },
    });

    // FIXED: Don't auto-redirect on 401/403 - this causes redirect loops with Clerk
    // that trigger bot protection. Instead, throw an error and let the page handle it.
    // The page can show a "session expired" message or use Clerk's <RedirectToSignIn />.
    if (response.status === 401 || response.status === 403) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.error || 'Authentication required',
        response.status,
        errorData
      );
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || response.statusText;
      throw new ApiError(
        `API request failed: ${errorMessage}`,
        response.status,
        errorData
      );
    }

    const data = await response.json();

    // Validate constitutional metadata on all responses
    validateConstitutionalMetadata(data);

    return data as T;
  }

  /**
   * Get providers list
   */
  async getProviders(): Promise<ProvidersListResponse> {
    return this.fetch<ProvidersListResponse>('/v1/providers');
  }

  /**
   * Create provider
   */
  async createProvider(request: CreateProviderRequest): Promise<ProviderDetailResponse> {
    return this.fetch<ProviderDetailResponse>('/v1/providers', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Get provider overview
   */
  async getProviderOverview(
    providerId: string,
    facilityId?: string
  ): Promise<ProviderOverviewResponse> {
    const query = facilityId ? `?facility=${encodeURIComponent(facilityId)}` : '';
    return this.fetch<ProviderOverviewResponse>(
      `/v1/providers/${providerId}/overview${query}`
    );
  }

  /**
   * Get topics list
   */
  async getTopics(providerId: string, facilityId?: string): Promise<TopicsListResponse> {
    const query = facilityId ? `?facility=${encodeURIComponent(facilityId)}` : '';
    return this.fetch<TopicsListResponse>(
      `/v1/providers/${providerId}/topics${query}`
    );
  }

  /**
   * Get topic detail
   */
  async getTopic(
    providerId: string,
    topicId: string,
    facilityId?: string
  ): Promise<Topic & ConstitutionalMetadata> {
    const query = facilityId ? `?facility=${encodeURIComponent(facilityId)}` : '';
    return this.fetch<Topic & ConstitutionalMetadata>(
      `/v1/providers/${providerId}/topics/${topicId}${query}`
    );
  }

  /**
   * Get mock sessions list
   */
  async getMockSessions(
    providerId: string,
    facilityId?: string
  ): Promise<MockSessionsListResponse> {
    const query = facilityId ? `?facility=${encodeURIComponent(facilityId)}` : '';
    return this.fetch<MockSessionsListResponse>(
      `/v1/providers/${providerId}/mock-sessions${query}`
    );
  }

  /**
   * Create mock inspection session
   */
  async createMockSession(
    providerId: string,
    topicId: string,
    facilityId: string
  ): Promise<MockInspectionSession> {
    return this.fetch<MockInspectionSession>(
      `/v1/providers/${providerId}/mock-sessions`,
      {
        method: 'POST',
        body: JSON.stringify({ topicId, facilityId }),
      }
    );
  }

  /**
   * Get mock session detail
   */
  async getMockSession(
    providerId: string,
    sessionId: string,
    facilityId?: string
  ): Promise<MockInspectionSession & ConstitutionalMetadata> {
    const query = facilityId ? `?facility=${encodeURIComponent(facilityId)}` : '';
    return this.fetch<MockInspectionSession & ConstitutionalMetadata>(
      `/v1/providers/${providerId}/mock-sessions/${sessionId}${query}`
    );
  }

  /**
   * Submit answer to mock session
   */
  async submitAnswer(
    providerId: string,
    sessionId: string,
    answer: string
  ): Promise<MockInspectionSession> {
    return this.fetch<MockInspectionSession>(
      `/v1/providers/${providerId}/mock-sessions/${sessionId}/answer`,
      {
        method: 'POST',
        body: JSON.stringify({ answer }),
      }
    );
  }

  /**
   * Get findings list
   */
  async getFindings(providerId: string, facilityId?: string): Promise<FindingsListResponse> {
    const query = facilityId ? `?facility=${encodeURIComponent(facilityId)}` : '';
    return this.fetch<FindingsListResponse>(
      `/v1/providers/${providerId}/findings${query}`
    );
  }

  /**
   * Get finding detail
   */
  async getFinding(
    providerId: string,
    findingId: string
  ): Promise<FindingDetailResponse> {
    return this.fetch<FindingDetailResponse>(
      `/v1/providers/${providerId}/findings/${findingId}`
    );
  }

  /**
   * Get evidence list
   */
  async getEvidence(providerId: string, facilityId?: string): Promise<EvidenceListResponse> {
    const query = facilityId ? `?facility=${encodeURIComponent(facilityId)}` : '';
    return this.fetch<EvidenceListResponse>(
      `/v1/providers/${providerId}/evidence${query}`
    );
  }

  /**
   * Get audit trail
   */
  async getAuditTrail(providerId: string, facilityId?: string): Promise<AuditTrailResponse> {
    const query = facilityId ? `?facility=${encodeURIComponent(facilityId)}` : '';
    return this.fetch<AuditTrailResponse>(
      `/v1/providers/${providerId}/audit-trail${query}`
    );
  }

  /**
   * Generate export
   */
  async generateExport(
    providerId: string,
    request: ExportRequest
  ): Promise<ExportResponse> {
    return this.fetch<ExportResponse>(
      `/v1/providers/${providerId}/exports`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );
  }

  /**
   * Get export status/metadata
   */
  async getExportStatus(providerId: string, facilityId?: string): Promise<ExportStatusResponse> {
    const query = facilityId ? `?facility=${encodeURIComponent(facilityId)}` : '';
    return this.fetch<ExportStatusResponse>(
      `/v1/providers/${providerId}/exports${query}`
    );
  }

  /**
   * Get facilities list
   */
  async getFacilities(providerId?: string): Promise<FacilitiesListResponse> {
    const path = providerId
      ? `/v1/providers/${providerId}/facilities`
      : '/v1/facilities';
    return this.fetch<FacilitiesListResponse>(path);
  }

  /**
   * Onboard facility (auto-populate from CQC API)
   */
  async onboardFacility(request: OnboardFacilityRequest): Promise<OnboardFacilityResponse> {
    return this.fetch<OnboardFacilityResponse>(
      `/v1/facilities/onboard`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );
  }

  /**
   * Create facility
   */
  async createFacility(request: CreateFacilityRequest): Promise<FacilityDetailResponse> {
    return this.fetch<FacilityDetailResponse>(
      `/v1/providers/${request.providerId}/facilities`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );
  }

  /**
   * Get facility detail
   */
  async getFacility(facilityId: string): Promise<FacilityDetailResponse> {
    return this.fetch<FacilityDetailResponse>(`/v1/facilities/${facilityId}`);
  }

  /**
   * Create evidence blob (returns scan status)
   */
  async createEvidenceBlob(request: CreateEvidenceBlobRequest): Promise<CreateEvidenceBlobResponseWithScan> {
    return this.fetch<CreateEvidenceBlobResponseWithScan>(
      '/v1/evidence/blobs',
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );
  }

  /**
   * Create facility evidence record
   */
  async createFacilityEvidence(
    request: CreateFacilityEvidenceRequest
  ): Promise<CreateFacilityEvidenceResponse> {
    return this.fetch<CreateFacilityEvidenceResponse>(
      `/v1/facilities/${request.facilityId}/evidence`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );
  }

  /**
   * Get facility evidence
   */
  async getFacilityEvidence(facilityId: string): Promise<EvidenceListResponse> {
    return this.fetch<EvidenceListResponse>(
      `/v1/facilities/${facilityId}/evidence`
    );
  }

  /**
   * Get background job status
   */
  async getBackgroundJob(jobId: string): Promise<BackgroundJobResponse> {
    return this.fetch<BackgroundJobResponse>(`/v1/background-jobs/${jobId}`);
  }

  /**
   * Get malware scan status for a blob
   */
  async getMalwareScanStatus(blobHash: string): Promise<MalwareScanResponse> {
    return this.fetch<MalwareScanResponse>(`/v1/evidence/blobs/${blobHash}/scan`);
  }

  /**
   * Get AI insights for a mock session (advisory only)
   */
  async getAIInsights(
    providerId: string,
    sessionId: string
  ): Promise<AIInsightsResponse> {
    return this.fetch<AIInsightsResponse>(
      `/v1/providers/${providerId}/mock-sessions/${sessionId}/ai-insights`
    );
  }

  /**
   * Trigger CQC report sync for a facility
   */
  async syncLatestReport(facilityId: string): Promise<SyncReportResponse> {
    return this.fetch<SyncReportResponse>(
      `/v1/facilities/${facilityId}/sync-latest-report`,
      { method: 'POST' }
    );
  }

  /**
   * Bulk onboard facilities from CQC
   */
  async bulkOnboardFacilities(request: BulkOnboardRequest): Promise<BulkOnboardResponse> {
    return this.fetch<BulkOnboardResponse>(
      `/v1/facilities/onboard-bulk`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );
  }
}

/**
 * Create API client instance
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}

/**
 * SECURITY HARDENING: Validate API base URL configuration
 *
 * In production (or when not in E2E mode), using localhost is a configuration error.
 * We log an error but don't throw to avoid breaking the app at runtime.
 */
function getValidatedApiBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const isE2EMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';

  if (!baseUrl) {
    if (!isE2EMode && typeof window !== 'undefined') {
      console.error(
        '[API CLIENT ERROR] NEXT_PUBLIC_API_BASE_URL is not set. ' +
        'API requests will default to localhost:3001. ' +
        'This is incorrect for production deployments.'
      );
    }
    return 'http://localhost:3001';
  }

  // Warn if using localhost in what appears to be production
  if (baseUrl.includes('localhost') && !isE2EMode && typeof window !== 'undefined') {
    // Check if we're likely in production (not localhost hostname)
    if (!window.location.hostname.includes('localhost')) {
      console.error(
        '[API CLIENT ERROR] NEXT_PUBLIC_API_BASE_URL contains localhost but ' +
        'app is not running on localhost. This is a configuration error. ' +
        `Current API URL: ${baseUrl}, App hostname: ${window.location.hostname}`
      );
    }
  }

  return baseUrl;
}

/**
 * Default API client instance
 *
 * In E2E test mode, inject a getToken that returns the test token so
 * all page-initiated API calls are authenticated against the API server.
 * In production, pages must call apiClient.updateConfig({ getToken }) after
 * obtaining the Clerk token provider.
 */
const _e2eMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';

export const apiClient = createApiClient({
  baseUrl: getValidatedApiBaseUrl(),
  ...(_e2eMode
    ? { getToken: async () => process.env.NEXT_PUBLIC_CLERK_TEST_TOKEN || 'test-clerk-token' }
    : {}),
});
