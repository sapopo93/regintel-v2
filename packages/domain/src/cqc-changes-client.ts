/**
 * CQC Location Search Client (Feature 1: CQC Live Intelligence)
 *
 * Day 0 spike confirmed: /public/v1/changes endpoint does NOT exist (404).
 * Architecture adapted to use /public/v1/locations search instead.
 *
 * Strategy: Sample locations matching provider's service type via paginated search,
 * then fetch each location's detail for current ratings. Locations with noteworthy
 * ratings (Outstanding, RI, Inadequate) get their reports scraped for findings text.
 *
 * CQC API shape (confirmed by spike):
 *   GET /public/v1/locations?careHome=Y&perPage=N&page=N
 *   → { locations: [{locationId, locationName, postalCode}], total, page, perPage, totalPages }
 *
 *   GET /public/v1/locations/:id
 *   → Full location detail with currentRatings, type, numberOfBeds, etc.
 *
 * Requires CQC_API_KEY for search (individual location lookups work without).
 */

export interface CqcLocationSummary {
  locationId: string;
  locationName: string;
  postalCode?: string;
}

export interface CqcLocationDetail {
  locationId: string;
  locationName: string;
  postalCode?: string;
  type: string;             // service type e.g. "Community based adult social care services"
  numberOfBeds?: number;
  currentRatings?: {
    overall?: {
      rating: string;       // "Good", "Requires improvement", "Inadequate", "Outstanding"
      reportDate?: string;
    };
    safe?: { rating: string };
    effective?: { rating: string };
    caring?: { rating: string };
    responsive?: { rating: string };
    wellLed?: { rating: string };
  };
  lastInspection?: {
    date?: string;
  };
}

export interface FetchCqcLocationsOptions {
  /** CQC search filter — e.g. careHome=Y for care homes */
  serviceFilter?: string;
  /** How many locations per API page (max 500) */
  perPage?: number;
  /** How many random pages to sample (default 2) */
  samplePages?: number;
  /** CQC API key (required for search) */
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export type FetchCqcLocationsResult =
  | { success: true; locations: CqcLocationSummary[]; totalAvailable: number }
  | { success: false; error: string };

/**
 * Search CQC locations by service type and return a random sample.
 *
 * The CQC API doesn't support "recently changed" filtering, so we sample
 * random pages from the full location list. The caller then fetches details
 * for each location to check for noteworthy ratings.
 */
export async function fetchCqcLocations(
  options: FetchCqcLocationsOptions
): Promise<FetchCqcLocationsResult> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl ?? 'https://api.service.cqc.org.uk';
  const perPage = options.perPage ?? 50;
  const samplePages = options.samplePages ?? 2;

  if (!options.apiKey) {
    return { success: false, error: 'CQC API key required for location search. Set CQC_API_KEY.' };
  }

  const allLocations: CqcLocationSummary[] = [];

  try {
    // First, fetch page 1 to get totalPages
    const firstPageUrl = buildSearchUrl(baseUrl, { ...options, perPage, page: 1 });
    const firstResult = await fetchPage(fetchFn, firstPageUrl, options.apiKey);
    if (!firstResult.success) return firstResult;

    allLocations.push(...firstResult.locations);
    const totalPages = firstResult.totalPages;
    const totalAvailable = firstResult.total;

    // Sample additional random pages if available
    if (totalPages > 1 && samplePages > 1) {
      const pagesToSample = pickRandomPages(totalPages, samplePages - 1);
      for (const page of pagesToSample) {
        const url = buildSearchUrl(baseUrl, { ...options, perPage, page });
        const result = await fetchPage(fetchFn, url, options.apiKey);
        if (result.success) {
          allLocations.push(...result.locations);
        }
        // Skip failures for individual pages — we already have page 1
      }
    }

    return { success: true, locations: allLocations, totalAvailable };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('timeout') || message.includes('abort')) {
      return { success: false, error: 'CQC API request timed out' };
    }
    return { success: false, error: `CQC API fetch failed: ${message}` };
  }
}

/**
 * Fetch full detail for a single CQC location.
 * Works without API key but benefits from having one (rate limits).
 */
export async function fetchCqcLocationDetail(
  locationId: string,
  options: { apiKey?: string; baseUrl?: string; fetch?: typeof globalThis.fetch } = {}
): Promise<{ success: true; detail: CqcLocationDetail } | { success: false; error: string }> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl ?? 'https://api.service.cqc.org.uk';

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.apiKey) {
      headers['Ocp-Apim-Subscription-Key'] = options.apiKey;
    }

    const response = await fetchFn(`${baseUrl}/public/v1/locations/${locationId}`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 404) return { success: false, error: `Location ${locationId} not found` };
      if (response.status === 429) return { success: false, error: 'CQC API rate limited' };
      return { success: false, error: `CQC API error: ${response.status}` };
    }

    const body = await response.json();
    return {
      success: true,
      detail: {
        locationId: body.locationId ?? locationId,
        locationName: body.locationName ?? body.name ?? '',
        postalCode: body.postalCode,
        type: body.type ?? '',
        numberOfBeds: body.numberOfBeds,
        currentRatings: body.currentRatings,
        lastInspection: body.lastInspection,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to fetch location detail: ${message}` };
  }
}

/**
 * Check if a location has a noteworthy rating that warrants alert generation.
 * Returns the key questions with noteworthy ratings.
 */
export function getNoteworthy(detail: CqcLocationDetail): Array<{
  keyQuestion: string;
  rating: string;
  isRisk: boolean;
  isOutstanding: boolean;
}> {
  const ratings = detail.currentRatings;
  if (!ratings) return [];

  const results: Array<{ keyQuestion: string; rating: string; isRisk: boolean; isOutstanding: boolean }> = [];

  const kqMap: Record<string, string> = {
    safe: 'SAFE',
    effective: 'EFFECTIVE',
    caring: 'CARING',
    responsive: 'RESPONSIVE',
    wellLed: 'WELL_LED',
  };

  for (const [key, kq] of Object.entries(kqMap)) {
    const r = (ratings as any)[key];
    if (!r?.rating) continue;

    const rating = r.rating;
    const isRisk = rating === 'Requires improvement' || rating === 'Inadequate';
    const isOutstanding = rating === 'Outstanding';

    if (isRisk || isOutstanding) {
      results.push({ keyQuestion: kq, rating, isRisk, isOutstanding });
    }
  }

  return results;
}

// --- Internal helpers ---

function buildSearchUrl(
  baseUrl: string,
  options: FetchCqcLocationsOptions & { page: number; perPage: number }
): string {
  const url = new URL(`${baseUrl}/public/v1/locations`);
  url.searchParams.set('perPage', String(options.perPage));
  url.searchParams.set('page', String(options.page));

  // Apply service type filter if provided
  if (options.serviceFilter) {
    // CQC API supports careHome=Y, nonResidential=Y, etc.
    const [key, value] = options.serviceFilter.split('=');
    if (key && value) url.searchParams.set(key, value);
  }

  return url.toString();
}

type PageResult =
  | { success: true; locations: CqcLocationSummary[]; totalPages: number; total: number }
  | { success: false; error: string };

async function fetchPage(
  fetchFn: typeof globalThis.fetch,
  url: string,
  apiKey: string
): Promise<PageResult> {
  const response = await fetchFn(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Ocp-Apim-Subscription-Key': apiKey,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    if (response.status === 401) return { success: false, error: 'CQC API key invalid or missing' };
    if (response.status === 429) return { success: false, error: 'CQC API rate limited' };
    return { success: false, error: `CQC API error: ${response.status}` };
  }

  const body = await response.json();
  const items = body.locations ?? [];

  const locations: CqcLocationSummary[] = items.map((item: any) => ({
    locationId: item.locationId ?? '',
    locationName: item.locationName ?? item.name ?? '',
    postalCode: item.postalCode,
  }));

  return {
    success: true,
    locations,
    totalPages: body.totalPages ?? 1,
    total: body.total ?? locations.length,
  };
}

/** Pick N random page numbers from 2..totalPages (excluding page 1 which is always fetched) */
function pickRandomPages(totalPages: number, count: number): number[] {
  if (totalPages <= 1) return [];
  const available = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  const shuffled = available.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, available.length));
}
