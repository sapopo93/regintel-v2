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

const KEY_QUESTION_SECTIONS = [
  { slug: 'safe', key: 'safe' },
  { slug: 'effective', key: 'effective' },
  { slug: 'caring', key: 'caring' },
  { slug: 'responsive', key: 'responsive' },
  { slug: 'well-led', key: 'wellLed' },
] as const;

const MIN_FINDING_PARAGRAPH_LENGTH = 100;

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
      ? `${baseUrl}/location/${normalized}/reports/${reportPlanId}/overall`
      : undefined;

    let overallReportHtml: string | undefined;
    let keyQuestionRatings = extractKeyQuestionRatings(html);
    if (htmlReportUrl) {
      overallReportHtml = await fetchHtmlPage({
        url: htmlReportUrl,
        timeoutMs,
        fetchFn,
      });

      if (overallReportHtml) {
        keyQuestionRatings = mergeKeyQuestionRatings(
          keyQuestionRatings,
          extractKeyQuestionRatings(overallReportHtml)
        );
      }
    }

    const keyQuestionFindings = reportPlanId
      ? await scrapeKeyQuestionFindings({
          baseUrl,
          locationId: normalized,
          reportPlanId,
          htmlReportUrl,
          overallReportHtml,
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
      baseUrl,
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
    baseUrl?: string;
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
      reportUrl: `${extractedData?.baseUrl ?? 'https://www.cqc.org.uk'}/location/${locationId}`,
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
    reportUrl: `${extractedData?.baseUrl ?? 'https://www.cqc.org.uk'}/location/${locationId}`,
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
  const ratings: NonNullable<CqcInspectionReport['keyQuestionRatings']> = {};

  // 1) Primary source: CQC data-test attributes (e.g. data-test="safe rating text: Good")
  const dataAttrMatches = html.matchAll(/data-test="([^"]*?)\s*rating text:\s*([^"]+)"/gi);
  for (const match of dataAttrMatches) {
    const key = toKeyQuestionKey(match[1]);
    if (!key) continue;
    const rating = normalizeRating(match[2]);
    if (!rating) continue;
    ratings[key] = rating;
  }

  // 2) Fallback source: rating summaries rendered in text/table form.
  const text = stripHtmlToText(html);
  const summaryMatches = text.matchAll(
    /\b(Safe|Effective|Caring|Responsive|Well[-\s]?led)\b[\s:|-]{0,10}(Outstanding|Good|Requires improvement|Requires Improvement|Inadequate|Insufficient evidence)\b/gi
  );
  for (const match of summaryMatches) {
    const key = toKeyQuestionKey(match[1]);
    if (!key || ratings[key]) continue;
    const rating = normalizeRating(match[2]);
    if (!rating) continue;
    ratings[key] = rating;
  }

  return Object.keys(ratings).length > 0 ? ratings : undefined;
}

async function scrapeKeyQuestionFindings(params: {
  baseUrl: string;
  locationId: string;
  reportPlanId: string;
  htmlReportUrl?: string;
  overallReportHtml?: string;
  timeoutMs: number;
  fetchFn: typeof globalThis.fetch;
}): Promise<CqcInspectionReport['keyQuestionFindings'] | undefined> {
  const findingsBySection = new Map<
    keyof NonNullable<CqcInspectionReport['keyQuestionFindings']>,
    string[]
  >();

  let overallHtml = params.overallReportHtml;
  if (!overallHtml && params.htmlReportUrl) {
    overallHtml = await fetchHtmlPage({
      url: params.htmlReportUrl,
      timeoutMs: params.timeoutMs,
      fetchFn: params.fetchFn,
    });
  }

  // Try extracting section text from the overall report page first.
  if (overallHtml) {
    const overallSectionParagraphs = extractSectionParagraphsFromOverallHtml(overallHtml);
    for (const section of KEY_QUESTION_SECTIONS) {
      const paragraphs = overallSectionParagraphs[section.key];
      if (!paragraphs?.length) continue;
      findingsBySection.set(section.key, paragraphs);
    }
  }

  await Promise.all(
    KEY_QUESTION_SECTIONS.map(async (section) => {
      const sectionUrl =
        `${params.baseUrl}/location/${params.locationId}/reports/${params.reportPlanId}/overall/${section.slug}`;
      try {
        const html = await fetchHtmlPage({
          url: sectionUrl,
          timeoutMs: params.timeoutMs,
          fetchFn: params.fetchFn,
        });

        if (!html) return;
        const paragraphs = extractQualifiedParagraphs(html);
        if (paragraphs.length === 0) return;

        const existing = findingsBySection.get(section.key) ?? [];
        findingsBySection.set(section.key, dedupeParagraphs([...existing, ...paragraphs]));
      } catch {
        // Ignore section-level failures and return what we can from other sections.
      }
    })
  );

  const findings: NonNullable<CqcInspectionReport['keyQuestionFindings']> = {};
  for (const section of KEY_QUESTION_SECTIONS) {
    const paragraphs = findingsBySection.get(section.key);
    if (!paragraphs?.length) continue;
    findings[section.key] = paragraphs.join('\n');
  }

  return Object.keys(findings).length > 0 ? findings : undefined;
}

function toKeyQuestionKey(
  input: string
): 'safe' | 'effective' | 'caring' | 'responsive' | 'wellLed' | undefined {
  const normalized = input.trim().toLowerCase();
  if (normalized.includes('well-led') || normalized.includes('well led') || normalized === 'wellled') {
    return 'wellLed';
  }
  if (normalized.includes('safe')) return 'safe';
  if (normalized.includes('effective')) return 'effective';
  if (normalized.includes('caring')) return 'caring';
  if (normalized.includes('responsive')) return 'responsive';

  return undefined;
}

function normalizeRating(value: string): string | undefined {
  const cleaned = value.replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '');
  if (!cleaned) return undefined;

  const lower = cleaned.toLowerCase();
  if (lower === 'good') return 'Good';
  if (lower === 'outstanding') return 'Outstanding';
  if (lower === 'requires improvement') return 'Requires Improvement';
  if (lower === 'inadequate') return 'Inadequate';
  if (lower === 'insufficient evidence') return 'Insufficient Evidence';

  return undefined;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|li|tr|td|th|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeKeyQuestionRatings(
  primary?: CqcInspectionReport['keyQuestionRatings'],
  fallback?: CqcInspectionReport['keyQuestionRatings']
): CqcInspectionReport['keyQuestionRatings'] | undefined {
  if (!primary && !fallback) return undefined;

  return {
    safe: primary?.safe ?? fallback?.safe,
    effective: primary?.effective ?? fallback?.effective,
    caring: primary?.caring ?? fallback?.caring,
    responsive: primary?.responsive ?? fallback?.responsive,
    wellLed: primary?.wellLed ?? fallback?.wellLed,
  };
}

function extractSectionParagraphsFromOverallHtml(
  html: string
): Partial<Record<keyof NonNullable<CqcInspectionReport['keyQuestionFindings']>, string[]>> {
  const output: Partial<Record<keyof NonNullable<CqcInspectionReport['keyQuestionFindings']>, string[]>> = {};
  const sectionHeadingPattern = '(safe|effective|caring|responsive|well[-\\s]?led)';

  for (const section of KEY_QUESTION_SECTIONS) {
    const headingToken = section.slug === 'well-led' ? 'well[-\\s]?led' : section.slug;
    const sectionRegex = new RegExp(
      `<h[1-6][^>]*>[^<]*${headingToken}[^<]*<\\/h[1-6]>([\\s\\S]*?)(?=<h[1-6][^>]*>[^<]*${sectionHeadingPattern}[^<]*<\\/h[1-6]>|$)`,
      'i'
    );
    const sectionMatch = html.match(sectionRegex);
    if (!sectionMatch?.[1]) continue;

    const paragraphs = extractQualifiedParagraphs(sectionMatch[1]);
    if (paragraphs.length === 0) continue;
    output[section.key] = paragraphs;
  }

  return output;
}

function extractQualifiedParagraphs(html: string): string[] {
  const rawParagraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) =>
    stripHtmlToText(match[1])
  );

  return dedupeParagraphs(rawParagraphs.filter(isQualifyingFindingParagraph));
}

function dedupeParagraphs(paragraphs: string[]): string[] {
  return Array.from(new Set(paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean)));
}

function isQualifyingFindingParagraph(paragraph: string): boolean {
  if (!paragraph || paragraph.length < MIN_FINDING_PARAGRAPH_LENGTH) {
    return false;
  }

  if (/^In [A-Z][a-z]+,\s+[A-Z]{1,2}\d/.test(paragraph)) {
    return false;
  }

  const lower = paragraph.toLowerCase();
  if (lower.includes('your information helps us decide')) {
    return false;
  }
  if (lower.includes("let's make care better together")) {
    return false;
  }
  if (lower.includes('tel:')) {
    return false;
  }
  if (/\b(?:\+44|0)\d[\d\s().-]{7,}\d\b/.test(paragraph)) {
    return false;
  }
  if (isLikelyUiText(lower)) {
    return false;
  }

  return true;
}

function isLikelyUiText(lower: string): boolean {
  const blockedUiFragments = [
    'skip to main content',
    'set cookie preferences',
    'accept all cookies',
    'back to top',
    'find and compare services',
    'page last updated',
    'contact us',
    'privacy notice',
  ];

  return blockedUiFragments.some((fragment) => lower.includes(fragment));
}

async function fetchHtmlPage(params: {
  url: string;
  timeoutMs: number;
  fetchFn: typeof globalThis.fetch;
}): Promise<string | undefined> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const response = await params.fetchFn(params.url, {
      method: 'GET',
      headers: {
        Accept: 'text/html',
        'User-Agent': 'RegIntel/2.0 (Compliance Platform)',
      },
      signal: controller.signal,
    });

    if (!response.ok) return undefined;
    return await response.text();
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeoutId);
  }
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
