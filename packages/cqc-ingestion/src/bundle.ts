import * as cheerio from 'cheerio';
import type { FetchLike, HtmlBundleArtifact, HtmlBundleSection } from './types';
import { createHttpClient } from './http';

export interface CrawlHtmlBundleOptions {
  url?: string;
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

function extractAssessmentId(url?: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/\/reports\/([^/?#]+)(?:\/|$)/i);
  return match ? match[1] : undefined;
}

function extractLocationId(url?: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/\/location\/([^/?#]+)\//i);
  return match ? match[1] : undefined;
}

function extractDomainFromUrl(url: string): string {
  const match = url.match(/\/reports\/[^/]+\/([^/?#]+)/i);
  return match ? match[1].toLowerCase() : 'overall';
}

function extractContentsLinks($: cheerio.CheerioAPI): string[] {
  const links: string[] = [];
  const candidates = $('nav, aside, .contents, .report-contents');

  const searchNodes = candidates.length ? candidates : $('body');
  searchNodes.find('a[href]').each((_, element) => {
    const href = String($(element).attr('href') || '').trim();
    if (!href) return;
    if (!href.includes('/reports/')) return;
    if (href.toLowerCase().includes('.pdf')) return;
    links.push(href);
  });

  return Array.from(new Set(links));
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractSection($: cheerio.CheerioAPI, domain: string): HtmlBundleSection {
  const headings: string[] = [];
  const paragraphs: string[] = [];

  $('h1, h2, h3').each((_, element) => {
    const text = cleanText($(element).text());
    if (text) headings.push(text);
  });

  $('p, li').each((_, element) => {
    const text = cleanText($(element).text());
    if (text && text.length > 2) paragraphs.push(text);
  });

  return {
    domain,
    headings: Array.from(new Set(headings)),
    paragraphs,
  };
}

export async function crawlHtmlAssessmentBundle(
  options: CrawlHtmlBundleOptions
): Promise<HtmlBundleArtifact> {
  if (!options.url && !options.html) {
    throw new Error('url or html must be provided');
  }

  const baseUrl = options.baseUrl ?? 'https://www.cqc.org.uk';
  const client = createHttpClient({ fetch: options.fetch, rateLimitMs: 500 });

  const firstHtml = options.html ?? (await client.getText(options.url!));
  const firstUrl = options.url ?? `${baseUrl.replace(/\/$/, '')}/unknown`;

  const first$ = cheerio.load(firstHtml);
  const assessmentId = extractAssessmentId(options.url) ||
    first$('meta[name="cqc:assessment-id"]').attr('content') ||
    'unknown-assessment';
  const locationId = extractLocationId(options.url) ||
    first$('meta[name="cqc:location-id"]').attr('content') ||
    'unknown-location';

  const contentLinks = extractContentsLinks(first$);
  const normalizedLinks = contentLinks.map((href) => normalizeUrl(href, baseUrl));

  if (!normalizedLinks.includes(firstUrl)) {
    normalizedLinks.push(firstUrl);
  }

  const sections: HtmlBundleSection[] = [];
  const htmlSnapshots: Record<string, string> = {};

  for (const link of normalizedLinks) {
    const html = link === firstUrl ? firstHtml : await client.getText(link);
    htmlSnapshots[link] = html;
    const $page = cheerio.load(html);
    const domain = extractDomainFromUrl(link);
    sections.push(extractSection($page, domain));
  }

  return {
    location_id: locationId,
    assessment_id: assessmentId,
    source_url: firstUrl,
    retrieved_at: new Date().toISOString(),
    sections,
    html_snapshots: htmlSnapshots,
  };
}
