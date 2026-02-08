import * as cheerio from 'cheerio';
import type { FetchLike, LocationTimelineEntry, LocationTimelineResult } from './types';
import { createHttpClient } from './http';

export interface ParseLocationTimelineOptions {
  locationId?: string;
  sourceUrl?: string;
  html?: string;
  fetch?: FetchLike;
  baseUrl?: string;
}

function normalizeUrl(url: string, base?: string): string {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  const baseUrl = base ?? 'https://www.cqc.org.uk';
  return `${baseUrl.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

function extractAssessmentId(url: string): string | null {
  const match = url.match(/\/reports\/([^/?#]+)(?:\/|$)/i);
  return match ? match[1] : null;
}

function parseDate(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return undefined;
  return new Date(parsed).toISOString().slice(0, 10);
}

function extractDateFromText(text: string): string | undefined {
  const match = text.match(/(\d{1,2}\s+\w+\s+\d{4})/);
  return match ? parseDate(match[1]) : undefined;
}

function inferPdfType(url: string, text: string): 'full' | 'summary' | 'easy_read' {
  const value = `${url} ${text}`.toLowerCase();
  if (value.includes('easy') && value.includes('read')) return 'easy_read';
  if (value.includes('summary')) return 'summary';
  return 'full';
}

function mergeEntry(target: LocationTimelineEntry, incoming: Partial<LocationTimelineEntry>): void {
  if (incoming.publication_date && !target.publication_date) {
    target.publication_date = incoming.publication_date;
  }
  if (incoming.assessment_date_start && !target.assessment_date_start) {
    target.assessment_date_start = incoming.assessment_date_start;
  }
  if (incoming.assessment_date_end && !target.assessment_date_end) {
    target.assessment_date_end = incoming.assessment_date_end;
  }
  if (incoming.html_urls) {
    for (const url of incoming.html_urls) {
      if (!target.html_urls.includes(url)) target.html_urls.push(url);
    }
  }
  if (incoming.pdf_urls) {
    for (const pdf of incoming.pdf_urls) {
      if (!target.pdf_urls.some((entry) => entry.url === pdf.url)) {
        target.pdf_urls.push(pdf);
      }
    }
  }
}

function parseAssessmentDates(text: string): { start?: string; end?: string } {
  const rangeMatch = text.match(/(\d{1,2}\s+\w+\s+\d{4})\s*(?:-|to|–)\s*(\d{1,2}\s+\w+\s+\d{4})/i);
  if (rangeMatch) {
    return {
      start: parseDate(rangeMatch[1]),
      end: parseDate(rangeMatch[2]),
    };
  }
  const single = extractDateFromText(text);
  return { start: single };
}

export async function parseLocationTimeline(
  options: ParseLocationTimelineOptions
): Promise<LocationTimelineResult> {
  const baseUrl = options.baseUrl ?? 'https://www.cqc.org.uk';
  const sourceUrl = options.sourceUrl ?? (options.locationId
    ? `${baseUrl.replace(/\/$/, '')}/location/${options.locationId}/reports`
    : '');

  let html = options.html;
  if (!html) {
    if (!sourceUrl) {
      throw new Error('sourceUrl or html must be provided');
    }
    const client = createHttpClient({ fetch: options.fetch, rateLimitMs: 500 });
    html = await client.getText(sourceUrl);
  }

  const $ = cheerio.load(html);
  const entries = new Map<string, LocationTimelineEntry>();

  // Strategy 1: data attributes
  $('[data-assessment-id]').each((_, element) => {
    const assessmentId = String($(element).attr('data-assessment-id') || '').trim();
    if (!assessmentId) return;

    const publicationDate = parseDate($(element).attr('data-publication-date') || undefined);
    const assessmentStart = parseDate($(element).attr('data-assessment-start') || undefined);
    const assessmentEnd = parseDate($(element).attr('data-assessment-end') || undefined);

    const record: LocationTimelineEntry = {
      assessment_id: assessmentId,
      publication_date: publicationDate,
      assessment_date_start: assessmentStart,
      assessment_date_end: assessmentEnd,
      html_urls: [],
      pdf_urls: [],
    };

    if (!entries.has(assessmentId)) {
      entries.set(assessmentId, record);
    } else {
      mergeEntry(entries.get(assessmentId)!, record);
    }
  });

  // Strategy 2: report cards
  $('article, .report, .inspection-report, li').each((_, element) => {
    const text = $(element).text();
    const links = $(element).find('a[href]');

    links.each((__, link) => {
      const href = String($(link).attr('href') || '').trim();
      if (!href) return;

      const isPdf = href.toLowerCase().includes('.pdf');
      const assessmentId = extractAssessmentId(href);
      if (!assessmentId) return;

      const normalized = normalizeUrl(href, baseUrl);
      const entry: LocationTimelineEntry = entries.get(assessmentId) || {
        assessment_id: assessmentId,
        html_urls: [],
        pdf_urls: [],
      };

      if (isPdf) {
        entry.pdf_urls.push({
          type: inferPdfType(href, $(link).text()),
          url: normalized,
        });
      } else {
        entry.html_urls.push(normalized);
      }

      const publicationDate = parseDate($(element).find('time').first().text())
        ?? extractDateFromText(text);
      const assessmentDates = parseAssessmentDates(text);

      mergeEntry(entry, {
        publication_date: publicationDate,
        assessment_date_start: assessmentDates.start,
        assessment_date_end: assessmentDates.end,
      });

      entries.set(assessmentId, entry);
    });
  });

  // Fallback: scrape any /reports/ URLs in the document
  $('a[href*="/reports/"]').each((_, element) => {
    const href = String($(element).attr('href') || '').trim();
    if (!href) return;
    const assessmentId = extractAssessmentId(href);
    if (!assessmentId) return;
    const normalized = normalizeUrl(href, baseUrl);

    const entry = entries.get(assessmentId) || {
      assessment_id: assessmentId,
      html_urls: [],
      pdf_urls: [],
    };

    if (href.toLowerCase().includes('.pdf')) {
      entry.pdf_urls.push({ type: inferPdfType(href, $(element).text()), url: normalized });
    } else {
      entry.html_urls.push(normalized);
    }

    entries.set(assessmentId, entry);
  });

  const locationId = options.locationId
    ?? $('meta[name="cqc:location-id"]').attr('content')
    ?? '';

  return {
    location_id: locationId,
    source_url: sourceUrl,
    retrieved_at: new Date().toISOString(),
    entries: Array.from(entries.values()),
  };
}

export function selectLatestByPublicationDate(
  entries: LocationTimelineEntry[]
): LocationTimelineEntry | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => {
    const aDate = a.publication_date ? Date.parse(a.publication_date) : 0;
    const bDate = b.publication_date ? Date.parse(b.publication_date) : 0;
    return bDate - aDate;
  });
  return sorted[0];
}
