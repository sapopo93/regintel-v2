import { createHash } from 'node:crypto';
import type { FetchLike, PdfArtifact } from './types';
import { createHttpClient } from './http';

export interface ParsePdfOptions {
  url?: string;
  buffer?: Buffer;
  fetch?: FetchLike;
  type?: PdfArtifact['type'];
}

async function extractPdfText(buffer: Buffer): Promise<{ text: string; numPages: number }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const getDocument = pdfjs.getDocument || (pdfjs as any).default?.getDocument;
  const data = new Uint8Array(buffer);
  const loadingTask = getDocument({ data });
  const pdf = await loadingTask.promise;
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? String(item.str) : ''))
      .join(' ');
    fullText += ` ${pageText}`;
  }

  return { text: fullText.trim(), numPages: pdf.numPages };
}

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function inferPdfType(url?: string): PdfArtifact['type'] {
  if (!url) return 'full';
  const value = url.toLowerCase();
  if (value.includes('easy') && value.includes('read')) return 'easy_read';
  if (value.includes('summary')) return 'summary';
  return 'full';
}

export async function parsePdfArtifact(options: ParsePdfOptions): Promise<PdfArtifact> {
  let buffer = options.buffer;

  if (!buffer) {
    if (!options.url) {
      throw new Error('buffer or url must be provided');
    }
    const client = createHttpClient({ fetch: options.fetch, rateLimitMs: 500 });
    buffer = await client.getBuffer(options.url);
  }

  const sha256 = sha256Hex(buffer);
  const { text, numPages } = await extractPdfText(buffer);

  const excerpt = text.slice(0, 500);

  return {
    type: options.type ?? inferPdfType(options.url),
    download_url: options.url ?? 'buffer://local',
    sha256,
    num_pages: numPages,
    text_excerpt: excerpt,
  };
}
