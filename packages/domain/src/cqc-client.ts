/**
 * CQC API Client (Phase 10: Facility Onboarding)
 *
 * Simple, single-source CQC API integration for facility onboarding.
 * No web scraping, no report parsing - just the public CQC API.
 */

export interface CqcLocationData {
  locationId: string;
  name: string;
  postalCode?: string;
  postalAddressLine1?: string;
  postalAddressTownCity?: string;
  registrationStatus: string;
  type: string; // e.g., "Care home service with nursing"
  numberOfBeds?: number;
  currentRatings?: {
    overall?: {
      rating: string; // e.g., "Good", "Requires improvement", "Inadequate", "Outstanding"
      reportDate?: string; // ISO date
    };
  };
}

export interface CqcApiError {
  code: 'NOT_FOUND' | 'TIMEOUT' | 'RATE_LIMITED' | 'API_ERROR' | 'INVALID_FORMAT';
  message: string;
  statusCode?: number;
}

export type CqcApiResult =
  | { success: true; data: CqcLocationData }
  | { success: false; error: CqcApiError };

/**
 * Validates CQC Location ID format.
 * Valid formats: 1-XXXXXXXXX (7 to 13 digits after the dash)
 */
export function isValidCqcLocationId(id: string): boolean {
  const normalized = id.trim();
  return /^1-[0-9]{7,13}$/.test(normalized);
}

/**
 * Fetches facility data from the CQC Public API.
 *
 * Design choices:
 * - Uses public CQC API (no authentication required for location lookups)
 * - Supports optional API key for better rate limits
 * - Implements timeout to prevent blocking operations
 * - Returns structured result type for error handling
 * - Does NOT throw exceptions - returns error results instead
 *
 * @param cqcLocationId - CQC Location ID (e.g., "1-123456789")
 * @param options - Optional configuration (timeout, baseUrl, apiKey for testing)
 * @returns Promise resolving to success with data or error
 */
export async function fetchCqcLocation(
  cqcLocationId: string,
  options: {
    timeoutMs?: number;
    baseUrl?: string;
    apiKey?: string;
    fetch?: typeof globalThis.fetch;
  } = {}
): Promise<CqcApiResult> {
  const {
    timeoutMs = 5000,
    baseUrl = 'https://api.service.cqc.org.uk',
    apiKey,
    fetch: fetchFn = globalThis.fetch,
  } = options;

  // Validate format first
  if (!isValidCqcLocationId(cqcLocationId)) {
    return {
      success: false,
      error: {
        code: 'INVALID_FORMAT',
        message: `Invalid CQC Location ID format. Expected: 1-XXXXXXXXX, got: ${cqcLocationId}`,
      },
    };
  }

  const normalized = cqcLocationId.trim();
  const url = `${baseUrl}/public/v1/locations/${normalized}`;

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    // Add API key if provided (improves rate limits)
    if (apiKey) {
      headers['Ocp-Apim-Subscription-Key'] = apiKey;
    }

    const response = await fetchFn(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle HTTP errors
    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `CQC Location ID ${normalized} not found`,
            statusCode: 404,
          },
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'CQC API rate limit exceeded',
            statusCode: 429,
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: `CQC API error: ${response.status} ${response.statusText}`,
          statusCode: response.status,
        },
      };
    }

    const json = (await response.json()) as CqcLocationData;

    return {
      success: true,
      data: json,
    };
  } catch (error) {
    // Handle timeout
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: {
          code: 'TIMEOUT',
          message: `CQC API request timed out after ${timeoutMs}ms`,
        },
      };
    }

    // Handle other errors (network, parsing, etc.)
    return {
      success: false,
      error: {
        code: 'API_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error fetching CQC data',
      },
    };
  }
}
