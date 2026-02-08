/**
 * CQC Report Scraper (Phase 10: Facility Onboarding - Report Enrichment)
 *
 * Scrapes the CQC website for the LATEST inspection report HTML.
 * This complements the CQC API by getting the freshest data (reports appear on website before API).
 *
 * Note: This is a SIMPLIFIED scraper for demonstration. Production would use:
 * - Proper HTML parser (cheerio, jsdom)
 * - Robust error handling
 * - Rate limiting
 * - Retry logic
 */

import type { CqcLocationData } from './cqc-client.js';

export interface CqcInspectionReport {
  locationId: string;
  reportDate: string; // ISO date when available
  publishedDate: string;
  rating: string; // Good, Requires improvement, Inadequate, Outstanding
  reportUrl: string;
  pdfUrl?: string;
  hasReport: boolean; // False for never-inspected facilities
  facilityName?: string;
  addressLine1?: string;
  townCity?: string;
  postcode?: string;
  findings?: {
    safe?: string;
    effective?: string;
    caring?: string;
    responsive?: string;
    wellLed?: string;
    overall?: string;
  };
  htmlContent?: string;
}

export interface CqcReportSummary {
  facilityName?: string;
  addressLine1?: string;
  townCity?: string;
  postcode?: string;
  rating?: string;
  reportDate?: string;
  reportUrl?: string;
  pdfUrl?: string;
  source: 'CQC_WEBSITE' | 'CQC_API';
}

export interface ScrapeError {
  code: 'NOT_FOUND' | 'NEVER_INSPECTED' | 'PARSE_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT';
  message: string;
}

export type ScrapeResult =
  | { success: true; report: CqcInspectionReport }
  | { success: false; error: ScrapeError };

/**
 * Scrapes the CQC website for the latest inspection report.
 *
 * Returns the HTML report data, which is typically more up-to-date than the API.
 *
 * @param cqcLocationId - CQC Location ID (e.g., "1-123456789")
 * @param options - Optional configuration (timeout, baseUrl for testing)
 * @returns Promise resolving to success with report or error
 */
export async function scrapeLatestReport(
  cqcLocationId: string,
  options: {
    timeoutMs?: number;
    baseUrl?: string;
    fetch?: typeof globalThis.fetch;
  } = {}
): Promise<ScrapeResult> {
  const {
    timeoutMs = 15000, // Longer timeout for scraping (15s)
    baseUrl = 'https://www.cqc.org.uk',
    fetch: fetchFn = globalThis.fetch,
  } = options;

  const normalized = cqcLocationId.trim();
  const url = `${baseUrl}/location/${normalized}`;

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `CQC Location ${normalized} not found on website`,
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: `HTTP ${response.status}: ${response.statusText}`,
        },
      };
    }

    const html = await response.text();

    // Parse HTML to extract report data
    // This is simplified - production would use a proper HTML parser
    const report = parseReportFromHtml(html, normalized);

    return {
      success: true,
      report: {
        ...report,
        htmlContent: html,
      },
    };
  } catch (error) {
    // Handle timeout
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: {
          code: 'TIMEOUT',
          message: `Scrape request timed out after ${timeoutMs}ms`,
        },
      };
    }

    // Handle other errors
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown scraping error',
      },
    };
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

function normalizeWhitespace(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function parseReportDate(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return undefined;
  return new Date(parsed).toISOString().slice(0, 10);
}

/**
 * Parses CQC HTML page to extract inspection report data.
 *
 * NOTE: This is a SIMPLIFIED implementation for demonstration.
 * Production version would use cheerio or jsdom for robust HTML parsing.
 *
 * The HTML structure we're looking for (simplified):
 * - Rating: <div class="cqc-rating">Good</div>
 * - Report date: <time class="report-date">01 December 2024</time>
 * - PDF link: <a href="/.../.../report.pdf">Download report</a>
 */
function parseReportFromHtml(html: string, locationId: string): CqcInspectionReport {
  // Check for "never inspected" indicators
  const neverInspectedPatterns = [
    'Not yet inspected',
    'Awaiting inspection',
    'No inspection reports',
    'This location has not been inspected',
  ];

  const hasNeverBeenInspected = neverInspectedPatterns.some((pattern) =>
    html.includes(pattern)
  );

  if (hasNeverBeenInspected) {
    return {
      locationId,
      reportDate: '',
      publishedDate: new Date().toISOString(),
      rating: '',
      reportUrl: `https://www.cqc.org.uk/location/${locationId}`,
      hasReport: false,
    };
  }

  // Extract facility name
  const ogTitleMatch = html.match(/property="og:title" content="([^"]+)"/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const rawName =
    (h1Match ? stripTags(h1Match[1]) : undefined) ||
    (ogTitleMatch ? ogTitleMatch[1] : undefined);
  const facilityName = normalizeWhitespace(rawName ? decodeHtmlEntities(rawName) : undefined);

  // Extract address (microdata or common address blocks)
  const streetMatch = html.match(/itemprop="streetAddress"[^>]*>([^<]+)</i);
  const localityMatch = html.match(/itemprop="addressLocality"[^>]*>([^<]+)</i);
  const postalMatch = html.match(/itemprop="postalCode"[^>]*>([^<]+)</i);
  const addressBlockMatch = html.match(/class="address"[^>]*>([\s\S]*?)<\/div>/i);
  const addressBlock = addressBlockMatch ? stripTags(addressBlockMatch[1]) : undefined;
  const addressParts = addressBlock ? addressBlock.split(',').map((part) => part.trim()) : [];

  const addressLine1 = normalizeWhitespace(
    streetMatch ? decodeHtmlEntities(streetMatch[1]) : addressParts[0]
  );
  const townCity = normalizeWhitespace(
    localityMatch ? decodeHtmlEntities(localityMatch[1]) : addressParts[1]
  );
  const postcode = normalizeWhitespace(
    postalMatch ? decodeHtmlEntities(postalMatch[1]) : addressParts[addressParts.length - 1]
  );

  // Extract rating (simplified regex - production would use DOM parser)
  const ratingMatch = html.match(
    /rating[^>]*>(Good|Outstanding|Requires improvement|Inadequate|Insufficient evidence)/i
  );
  const rating = ratingMatch ? ratingMatch[1] : 'Unknown';

  // Extract report date (simplified)
  const timeMatch = html.match(/<time[^>]*>([^<]+)<\/time>/i);
  const dateMatch = html.match(/(\d{1,2}\s+\w+\s+\d{4})/);
  const rawDate = timeMatch ? timeMatch[1] : dateMatch ? dateMatch[1] : '';
  const reportDate = parseReportDate(rawDate) ?? '';

  // Extract PDF URL (simplified)
  const pdfMatch = html.match(/href="([^"]*\.pdf)"/);
  const pdfUrl = pdfMatch ? `https://www.cqc.org.uk${pdfMatch[1]}` : undefined;

  return {
    locationId,
    reportDate,
    publishedDate: new Date().toISOString(),
    rating,
    reportUrl: `https://www.cqc.org.uk/location/${locationId}`,
    pdfUrl,
    hasReport: true,
    facilityName,
    addressLine1,
    townCity,
    postcode,
    findings: {
      // These would be extracted from the HTML
      overall: `This location is rated ${rating}`,
    },
  };
}

function toComparableDate(value?: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function isWebsiteReportNewer(
  websiteReportDate?: string,
  apiReportDate?: string
): boolean {
  const website = toComparableDate(websiteReportDate);
  const api = toComparableDate(apiReportDate);
  if (!website) return false;
  if (!api) return true;
  return website > api;
}

export function buildCqcReportSummary(
  report: CqcInspectionReport,
  apiData?: CqcLocationData | null
): CqcReportSummary {
  const apiRating = apiData?.currentRatings?.overall?.rating;
  const apiReportDate = apiData?.currentRatings?.overall?.reportDate;

  const facilityName = report.facilityName ?? apiData?.name;
  const addressLine1 = report.addressLine1 ?? apiData?.postalAddressLine1;
  const townCity = report.townCity ?? apiData?.postalAddressTownCity;
  const postcode = report.postcode ?? apiData?.postalCode;
  const rating = report.rating || apiRating;
  const reportDate = report.reportDate || apiReportDate;

  return {
    facilityName,
    addressLine1,
    townCity,
    postcode,
    rating,
    reportDate,
    reportUrl: report.reportUrl,
    pdfUrl: report.pdfUrl,
    source: 'CQC_WEBSITE',
  };
}

/**
 * Downloads a PDF report from CQC website.
 *
 * @param pdfUrl - Full URL to the PDF
 * @param options - Optional fetch configuration
 * @returns Base64-encoded PDF content or error
 */
export async function downloadPdfReport(
  pdfUrl: string,
  options: {
    timeoutMs?: number;
    fetch?: typeof globalThis.fetch;
  } = {}
): Promise<{ success: true; contentBase64: string } | { success: false; error: string }> {
  const { timeoutMs = 30000, fetch: fetchFn = globalThis.fetch } = options;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetchFn(pdfUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/pdf',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to download PDF: HTTP ${response.status}`,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentBase64 = buffer.toString('base64');

    return {
      success: true,
      contentBase64,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown download error',
    };
  }
}
