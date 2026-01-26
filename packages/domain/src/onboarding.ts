/**
 * Facility Onboarding Logic (Phase 10: Facility Onboarding)
 *
 * Orchestrates the onboarding process with CQC API fallback to manual input.
 * Implements conflict resolution rules and data source tracking.
 */

import { fetchCqcLocation, type CqcLocationData, type CqcApiError } from './cqc-client.js';

export interface OnboardFacilityInput {
  providerId: string;
  cqcLocationId: string;
  // Optional fields - can be derived from CQC or manually provided
  facilityName?: string;
  addressLine1?: string;
  townCity?: string;
  postcode?: string;
  serviceType?: string;
  capacity?: number;
}

export interface MergedFacilityData {
  facilityName: string;
  addressLine1: string;
  townCity: string;
  postcode: string;
  serviceType: string;
  capacity?: number;
  cqcLocationId: string;
  // Metadata
  dataSource: 'CQC_API' | 'MANUAL';
  cqcSyncedAt: string | null;
  latestRating?: string;
  latestRatingDate?: string;
}

export interface OnboardingResult {
  facilityData: MergedFacilityData;
  cqcData: CqcLocationData | null;
  isNew: boolean; // Will be determined by store when upserting
}

/**
 * Maps CQC service type to RegIntel normalized service type.
 * CQC has verbose names like "Care home service with nursing",
 * we normalize to: residential, nursing, domiciliary, etc.
 *
 * Order matters: More specific patterns checked first.
 */
function normalizeCqcServiceType(cqcType: string): string {
  const lower = cqcType.toLowerCase();

  // Check for explicit "without nursing" first (more specific)
  if (lower.includes('without nursing') || lower.includes('no nursing')) {
    return 'residential';
  }

  // Then check for "with nursing" or just "nursing"
  if (lower.includes('with nursing') || (lower.includes('nursing') && !lower.includes('without'))) {
    return 'nursing';
  }

  // Domiciliary care
  if (lower.includes('domiciliary') || lower.includes('home care')) {
    return 'domiciliary';
  }

  // Supported living
  if (lower.includes('supported living')) {
    return 'supported_living';
  }

  // Hospice
  if (lower.includes('hospice')) {
    return 'hospice';
  }

  // Residential or care home (catch-all for care homes)
  if (lower.includes('residential') || lower.includes('care home')) {
    return 'residential';
  }

  // Default to residential if unknown
  return 'residential';
}

/**
 * Merges CQC API data with user input according to conflict resolution rules:
 *
 * Conflict Resolution Rules:
 * ┌──────────────┬───────────────────────────────┬───────────────────────┐
 * │    Field     │       CQC API Available       │  CQC API Unavailable  │
 * ├──────────────┼───────────────────────────────┼───────────────────────┤
 * │ facilityName │ User input > CQC name         │ User input (required) │
 * ├──────────────┼───────────────────────────────┼───────────────────────┤
 * │ capacity     │ CQC numberOfBeds > User input │ User input            │
 * ├──────────────┼───────────────────────────────┼───────────────────────┤
 * │ serviceType  │ CQC type > User input         │ User input (required) │
 * ├──────────────┼───────────────────────────────┼───────────────────────┤
 * │ address      │ User input always             │ User input (required) │
 * ├──────────────┼───────────────────────────────┼───────────────────────┤
 * │ postcode     │ User input > CQC postalCode   │ User input            │
 * └──────────────┴───────────────────────────────┴───────────────────────┘
 */
function mergeFacilityData(
  input: OnboardFacilityInput,
  cqcData: CqcLocationData | null,
  cqcError?: CqcApiError
): MergedFacilityData {
  const now = new Date().toISOString();

  if (cqcData) {
    // CQC API available - merge with preference to CQC for authoritative data
    return {
      // User input wins for facility name (allows overrides like "Main Building")
      facilityName: input.facilityName?.trim() || cqcData.name.trim(),

      // User input always wins for address (they know their exact address better)
      addressLine1: input.addressLine1?.trim() || cqcData.postalAddressLine1?.trim() || '',
      townCity: input.townCity?.trim() || cqcData.postalAddressTownCity?.trim() || '',
      postcode: input.postcode?.trim() || cqcData.postalCode?.trim() || '',

      // CQC wins for service type (authoritative)
      serviceType: normalizeCqcServiceType(cqcData.type),

      // CQC wins for capacity (authoritative bed count)
      capacity: cqcData.numberOfBeds ?? input.capacity,

      cqcLocationId: cqcData.locationId.trim(),

      // Metadata
      dataSource: 'CQC_API',
      cqcSyncedAt: now,
      latestRating: cqcData.currentRatings?.overall?.rating,
      latestRatingDate: cqcData.currentRatings?.overall?.reportDate,
    };
  }

  // CQC API unavailable - use manual input only
  if (!input.facilityName || !input.addressLine1 || !input.townCity || !input.postcode || !input.serviceType) {
    const detail = cqcError
      ? ` CQC error: ${cqcError.code}${cqcError.statusCode ? ` (${cqcError.statusCode})` : ''} - ${cqcError.message}`
      : '';
    throw new Error(
      `When CQC API is unavailable, facilityName, addressLine1, townCity, postcode, and serviceType are required.${detail}`
    );
  }

  return {
    facilityName: input.facilityName.trim(),
    addressLine1: input.addressLine1.trim(),
    townCity: input.townCity.trim(),
    postcode: input.postcode.trim(),
    serviceType: input.serviceType.trim(),
    capacity: input.capacity,
    cqcLocationId: input.cqcLocationId.trim(),

    // Metadata
    dataSource: 'MANUAL',
    cqcSyncedAt: null,
  };
}

/**
 * Onboards a facility by attempting to fetch from CQC API and merging with user input.
 *
 * Process:
 * 1. Validate CQC Location ID format
 * 2. Attempt to fetch from CQC API (with timeout)
 * 3. Merge CQC data with user input (or use manual data if CQC fails)
 * 4. Return merged facility data for upserting
 *
 * Note: This function does NOT persist to the database. The caller is responsible
 * for upserting the facility data and auditing the event.
 *
 * @param input - Onboarding input with CQC ID and optional manual fields
 * @param options - Optional CQC API fetch options (for testing, includes apiKey)
 * @returns OnboardingResult with merged facility data
 */
export async function onboardFacility(
  input: OnboardFacilityInput,
  options?: {
    timeoutMs?: number;
    baseUrl?: string;
    apiKey?: string;
    fetch?: typeof globalThis.fetch;
  }
): Promise<OnboardingResult> {
  // Attempt to fetch from CQC API
  const cqcResult = await fetchCqcLocation(input.cqcLocationId, options);

  let cqcData: CqcLocationData | null = null;

  if (cqcResult.success) {
    cqcData = cqcResult.data;
  }
  // If CQC fails, we'll fall back to manual input (handled in mergeFacilityData)

  // Merge CQC data with user input
  const facilityData = mergeFacilityData(
    input,
    cqcData,
    cqcResult.success ? undefined : cqcResult.error
  );

  return {
    facilityData,
    cqcData,
    isNew: false, // Will be determined by store during upsert
  };
}
