/**
 * Type-safe API Client for RegIntel UI
 *
 * All API communication goes through this client.
 * Enforces constitutional metadata on all responses.
 */

import { ConstitutionalViolationError } from '../validators';
import { getAuthToken, clearAuthToken } from '../auth';
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
  CreateEvidenceBlobResponse,
  CreateFacilityEvidenceRequest,
  CreateFacilityEvidenceResponse,
} from './types';

/**
 * API client configuration
 */
interface ApiClientConfig {
  baseUrl: string;
  tenantId?: string;
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
  constructor(private config: ApiClientConfig) {}

  /**
   * Generic fetch wrapper with error handling
   */
  private async fetch<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const authToken = getAuthToken();

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(this.config.tenantId ? { 'X-Tenant-Id': this.config.tenantId } : {}),
        ...options?.headers,
      },
    });

    if (response.status === 401 || response.status === 403) {
      clearAuthToken();
      if (typeof window !== 'undefined') {
        const next = window.location.pathname + window.location.search;
        window.location.href = `/login?next=${encodeURIComponent(next)}`;
      }
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
  async getAuditTrail(providerId: string): Promise<AuditTrailResponse> {
    return this.fetch<AuditTrailResponse>(
      `/v1/providers/${providerId}/audit-trail`
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
   * Create evidence blob
   */
  async createEvidenceBlob(request: CreateEvidenceBlobRequest): Promise<CreateEvidenceBlobResponse> {
    return this.fetch<CreateEvidenceBlobResponse>(
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
}

/**
 * Create API client instance
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}

/**
 * Default API client instance
 */
export const apiClient = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001',
});
