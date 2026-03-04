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

export interface CqcInspectionReport {
  locationId: string;
  reportDate: string;
  publishedDate: string;
  rating: string; // Good, Requires Improvement, Inadequate, Outstanding
  reportUrl: string;
  pdfUrl?: string;
  keyQuestionRatings?: {
    safe?: string;
    effective?: string;
    caring?: string;
    responsive?: string;
    wellLed?: string;
  };
  keyQuestionFindings?: {
    safe?: string;
    effective?: string;
    caring?: string;
    responsive?: string;
    wellLed?: string;
  };
  reportPlanId?: string;
  htmlReportUrl?: string;
  hasReport: boolean; // False for never-inspected facilities
  findings?: {
    safe?: string;
    effective?: string;
    caring?: string;
    responsive?: string;
    wellLed?: string;
    overall?: string;
  };
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
        'User-Agent': 'RegIntel/2.0 (Compliance Platform)',
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
    const reportPlanId = html.match(/\/location\/[^/]+\/reports\/([^/]+)\/overall/)?.[1];
    const htmlReportUrl = reportPlanId
      ? `https://www.cqc.org.uk/location/${normalized}/reports/${reportPlanId}/overall`
      : undefined;

    const keyQuestionRatings = extractKeyQuestionRatings(html);

    const keyQuestionFindings = reportPlanId
      ? await scrapeKeyQuestionFindings({
          locationId: normalized,
          reportPlanId,
          timeoutMs,
          fetchFn,
        })
      : undefined;

    // Parse HTML to extract report data
    // This is simplified - production would use a proper HTML parser
    const report = parseReportFromHtml(html, normalized, {
      keyQuestionRatings,
      keyQuestionFindings,
      reportPlanId,
      htmlReportUrl,
    });

    return {
      success: true,
      report,
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

/**
 * Parses CQC HTML page to extract inspection report data.
 *
 * NOTE: This is a SIMPLIFIED implementation for demonstration.
 * Production version would use cheerio or jsdom for robust HTML parsing.
 *
 * The HTML structure we're looking for (simplified):
 * - Rating: <div class="cqc-rating">Good</div>
 * - Report date: <time class="report-date">01 December 2024</time>
 */
function parseReportFromHtml(
  html: string,
  locationId: string,
  extractedData?: {
    keyQuestionRatings?: CqcInspectionReport['keyQuestionRatings'];
    keyQuestionFindings?: CqcInspectionReport['keyQuestionFindings'];
    reportPlanId?: string;
    htmlReportUrl?: string;
  }
): CqcInspectionReport {
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
      keyQuestionRatings: extractedData?.keyQuestionRatings,
      keyQuestionFindings: extractedData?.keyQuestionFindings,
      reportPlanId: extractedData?.reportPlanId,
      htmlReportUrl: extractedData?.htmlReportUrl,
      hasReport: false,
    };
  }

  // Extract rating (simplified regex - production would use DOM parser)
  const ratingMatch = html.match(/rating[^>]*>(Good|Outstanding|Requires improvement|Inadequate|Insufficient evidence)/i);
  const rating = ratingMatch ? ratingMatch[1] : 'Unknown';

  // Extract report date (simplified)
  const dateMatch = html.match(/(\d{1,2}\s+\w+\s+\d{4})/);
  const reportDate = dateMatch ? dateMatch[1] : '';

  return {
    locationId,
    reportDate,
    publishedDate: new Date().toISOString(),
    rating,
    reportUrl: `https://www.cqc.org.uk/location/${locationId}`,
    keyQuestionRatings: extractedData?.keyQuestionRatings,
    keyQuestionFindings: extractedData?.keyQuestionFindings,
    reportPlanId: extractedData?.reportPlanId,
    htmlReportUrl: extractedData?.htmlReportUrl,
    hasReport: true,
    findings: {
      // These would be extracted from the HTML
      overall: `This location is rated ${rating}`,
      ...(extractedData?.keyQuestionFindings ?? {}),
    },
  };
}

function extractKeyQuestionRatings(
  html: string
): CqcInspectionReport['keyQuestionRatings'] | undefined {
  const matches = html.matchAll(/data-test="(\w+[\w-]*) rating text: (\w+)"/g);
  const ratings: NonNullable<CqcInspectionReport['keyQuestionRatings']> = {};

  for (const match of matches) {
    const key = toKeyQuestionKey(match[1]);
    if (!key) continue;
    ratings[key] = match[2];
  }

  return Object.keys(ratings).length > 0 ? ratings : undefined;
}

async function scrapeKeyQuestionFindings(params: {
  locationId: string;
  reportPlanId: string;
  timeoutMs: number;
  fetchFn: typeof globalThis.fetch;
}): Promise<CqcInspectionReport['keyQuestionFindings'] | undefined> {
  const sections = ['safe', 'effective', 'caring', 'responsive', 'well-led'] as const;
  const findings: NonNullable<CqcInspectionReport['keyQuestionFindings']> = {};

  await Promise.all(
    sections.map(async (section) => {
      const sectionUrl = `https://www.cqc.org.uk/location/${params.locationId}/reports/${params.reportPlanId}/overall/${section}`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs);

        const response = await params.fetchFn(sectionUrl, {
          method: 'GET',
          headers: {
            Accept: 'text/html',
            'User-Agent': 'RegIntel/2.0 (Compliance Platform)',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) return;

        const html = await response.text();
        const paragraphs = [...html.matchAll(/<p[^>]*>([^<]{50,})<\/p>/g)]
          .map((match) => match[1].replace(/\s+/g, ' ').trim())
          .filter(Boolean);

        if (paragraphs.length === 0) return;

        const key = toKeyQuestionKey(section);
        if (!key) return;
        findings[key] = paragraphs.slice(0, 5).join('\n');
      } catch {
        // Ignore section-level failures and return what we can from other sections.
      }
    })
  );

  return Object.keys(findings).length > 0 ? findings : undefined;
}

function toKeyQuestionKey(
  input: string
): 'safe' | 'effective' | 'caring' | 'responsive' | 'wellLed' | undefined {
  if (input === 'well-led') return 'wellLed';
  if (input === 'safe' || input === 'effective' || input === 'caring' || input === 'responsive') {
    return input;
  }

  return undefined;
}

/**
 * Compares website report date to API report date.
 * Returns true if the website report is newer than the API version.
 */
export function isWebsiteReportNewer(
  websiteReportDate: string | undefined,
  apiReportDate: string | undefined
): boolean {
  if (!websiteReportDate) return false;
  if (!apiReportDate) return true;

  // Parse dates for comparison — try ISO first, then informal date strings
  const webDate = new Date(websiteReportDate);
  const apiDate = new Date(apiReportDate);

  if (isNaN(webDate.getTime()) || isNaN(apiDate.getTime())) {
    // If dates can't be parsed, treat website as newer (safer to re-scrape)
    return true;
  }

  return webDate > apiDate;
}

/**
 * Builds a summary object from a scraped CQC report and optional API data.
 */
export function buildCqcReportSummary(
  report: CqcInspectionReport,
  apiData?: { currentRatings?: { overall?: { reportDate?: string; rating?: string } } } | null
): {
  rating: string;
  reportDate: string;
  reportUrl: string;
  htmlReportUrl?: string;
  reportPlanId?: string;
  keyQuestionRatings?: CqcInspectionReport['keyQuestionRatings'];
  keyQuestionFindings?: CqcInspectionReport['keyQuestionFindings'];
  apiRating?: string;
  apiReportDate?: string;
} {
  return {
    rating: report.rating || apiData?.currentRatings?.overall?.rating || '',
    reportDate: report.reportDate || apiData?.currentRatings?.overall?.reportDate || '',
    reportUrl: report.reportUrl,
    htmlReportUrl: report.htmlReportUrl,
    reportPlanId: report.reportPlanId,
    keyQuestionRatings: report.keyQuestionRatings,
    keyQuestionFindings: report.keyQuestionFindings,
    apiRating: apiData?.currentRatings?.overall?.rating,
    apiReportDate: apiData?.currentRatings?.overall?.reportDate,
  };
}

export function buildHtmlReportBuffer(report: CqcInspectionReport): {
  buffer: Buffer;
  mimeType: 'text/html';
} {
  const keyQuestions: Array<{
    key: keyof NonNullable<CqcInspectionReport['keyQuestionFindings']>;
    label: string;
  }> = [
    { key: 'safe', label: 'Safe' },
    { key: 'effective', label: 'Effective' },
    { key: 'caring', label: 'Caring' },
    { key: 'responsive', label: 'Responsive' },
    { key: 'wellLed', label: 'Well-led' },
  ];

  const ratingsRows = keyQuestions
    .map(({ key, label }) => {
      const value = report.keyQuestionRatings?.[key] ?? 'N/A';
      return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
    })
    .join('');

  const findingSections = keyQuestions
    .map(({ key, label }) => {
      const finding = report.keyQuestionFindings?.[key];
      if (!finding) return '';
      const formattedFinding = escapeHtml(finding).replace(/\n/g, '<br />');
      return `<section><h2>${escapeHtml(label)}</h2><p>${formattedFinding}</p></section>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>CQC Inspection Report - ${escapeHtml(report.locationId)}</title>
  </head>
  <body>
    <h1>CQC Inspection Report - ${escapeHtml(report.locationId)}</h1>
    <p><strong>Overall rating:</strong> ${escapeHtml(report.rating || 'Unknown')}</p>
    <table border="1" cellspacing="0" cellpadding="6">
      <thead>
        <tr><th>Key question</th><th>Rating</th></tr>
      </thead>
      <tbody>
        ${ratingsRows}
      </tbody>
    </table>
    ${findingSections}
  </body>
</html>`;

  return {
    buffer: Buffer.from(html, 'utf-8'),
    mimeType: 'text/html',
  };
}

/**
 * Backward-compatible shim. CQC no longer publishes PDF reports.
 * Use buildHtmlReportBuffer(report) for HTML report content.
 */
export async function downloadPdfReport(
  _pdfUrl: string,
  _options: {
    timeoutMs?: number;
    fetch?: typeof globalThis.fetch;
  } = {}
): Promise<{ success: true; contentBase64: string } | { success: false; error: string }> {
  return {
    success: false,
    error: 'CQC no longer publishes PDF reports. Use buildHtmlReportBuffer(report) instead.',
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
