import type { FacilityRecord, RatingLabel, FetchLike, QualitySummary } from './types';
import { createHttpClient } from './http';
import { createRateLimiter } from './rate-limit';

export interface IngestFacilityOptions {
  locationId: string;
  apiKey?: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

interface RawApiLocation {
  locationId?: string;
  providerId?: string;
  name?: string;
  serviceName?: string;
  registrationStatus?: string;
  phoneNumber?: string;
  regulatedActivities?: Array<{ name?: string } | string>;
  specialisms?: Array<{ name?: string } | string>;
  serviceUsers?: Array<{ name?: string } | string>;
  currentRatings?: {
    overall?: { rating?: string };
    safe?: { rating?: string };
    effective?: { rating?: string };
    caring?: { rating?: string };
    responsive?: { rating?: string };
    wellLed?: { rating?: string };
  };
  postalAddressLine1?: string;
  postalAddressLine2?: string;
  postalAddressTownCity?: string;
  postalAddressCounty?: string;
  postalCode?: string;
  providerName?: string;
}

function toRating(value?: string): RatingLabel | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  if (normalized === 'Outstanding') return 'Outstanding';
  if (normalized === 'Good') return 'Good';
  if (normalized === 'Requires improvement' || normalized === 'Requires Improvement') {
    return 'Requires improvement';
  }
  if (normalized === 'Inadequate') return 'Inadequate';
  if (normalized === 'Insufficient evidence' || normalized === 'Insufficient Evidence') {
    return 'Insufficient evidence';
  }
  return 'Unknown';
}

function normalizeArray(value?: Array<{ name?: string } | string>): string[] {
  if (!value) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry : entry.name))
    .filter((entry): entry is string => Boolean(entry && entry.trim()))
    .map((entry) => entry.trim());
}

function buildAddress(raw: RawApiLocation): string {
  const parts = [
    raw.postalAddressLine1,
    raw.postalAddressLine2,
    raw.postalAddressTownCity,
    raw.postalAddressCounty,
    raw.postalCode,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return parts.join(', ');
}

export function normalizeFacilityFromApi(raw: RawApiLocation, warnings: string[]): FacilityRecord {
  const locationId = raw.locationId?.trim();
  if (!locationId) {
    warnings.push('API location_id missing');
  }

  const serviceName = raw.serviceName ?? raw.name ?? 'Unknown Service';
  if (!raw.serviceName && !raw.name) {
    warnings.push('API service name missing');
  }

  const address = buildAddress(raw);
  if (!address) {
    warnings.push('API address missing');
  }

  return {
    location_id: locationId ?? 'UNKNOWN',
    provider_id: raw.providerId?.trim(),
    service_name: serviceName.trim(),
    address,
    phone: raw.phoneNumber?.trim(),
    provider_name: raw.providerName?.trim(),
    regulated_activities: normalizeArray(raw.regulatedActivities),
    population_groups: normalizeArray(raw.serviceUsers ?? raw.specialisms),
    registration_status: raw.registrationStatus?.trim(),
    ratings: {
      overall: toRating(raw.currentRatings?.overall?.rating),
      safe: toRating(raw.currentRatings?.safe?.rating),
      effective: toRating(raw.currentRatings?.effective?.rating),
      caring: toRating(raw.currentRatings?.caring?.rating),
      responsive: toRating(raw.currentRatings?.responsive?.rating),
      well_led: toRating(raw.currentRatings?.wellLed?.rating),
    },
  };
}

export async function ingestFacilityFromApi(
  options: IngestFacilityOptions
): Promise<{ facility: FacilityRecord; quality: QualitySummary; raw: RawApiLocation }> {
  const baseUrl = options.baseUrl ?? 'https://api.service.cqc.org.uk';
  const url = `${baseUrl.replace(/\/$/, '')}/public/v1/locations/${options.locationId.trim()}`;
  const limiter = createRateLimiter(500);

  const response = await limiter.schedule(async () => (options.fetch ?? globalThis.fetch)(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.apiKey ? { 'Ocp-Apim-Subscription-Key': options.apiKey } : {}),
    },
  }));

  if (!response.ok) {
    throw new Error(`CQC API error ${response.status}: ${response.statusText}`);
  }

  const raw = (await response.json()) as RawApiLocation;
  const warnings: string[] = [];
  const facility = normalizeFacilityFromApi(raw, warnings);

  const parseConfidence = warnings.length === 0 ? 1 : Math.max(0.6, 1 - warnings.length * 0.05);

  return {
    facility,
    quality: {
      parse_confidence: parseConfidence,
      warnings,
    },
    raw,
  };
}

export async function fetchLocationHtml(
  locationId: string,
  options: { fetch?: FetchLike; baseUrl?: string }
): Promise<string> {
  const client = createHttpClient({ fetch: options.fetch, rateLimitMs: 500 });
  const baseUrl = options.baseUrl ?? 'https://www.cqc.org.uk';
  const url = `${baseUrl.replace(/\/$/, '')}/location/${locationId.trim()}`;
  return client.getText(url);
}
