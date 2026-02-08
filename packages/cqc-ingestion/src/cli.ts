#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ingestFacilityFromApi,
  parseLocationTimeline,
  crawlHtmlAssessmentBundle,
  parsePdfArtifact,
  reconcileAssessmentEvent,
  type FacilityRecord,
  type LocationTimelineResult,
  type HtmlBundleArtifact,
  type PdfArtifact,
} from './index.js';

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function outputResult(result: unknown): Promise<void> {
  const outFile = getArg('--out');
  const json = JSON.stringify(result, null, 2);
  if (outFile) {
    await writeFile(resolve(outFile), json);
    return;
  }
  console.log(json);
}

async function loadJson(path: string): Promise<any> {
  const content = await readFile(resolve(path), 'utf-8');
  return JSON.parse(content);
}

async function loadText(path: string): Promise<string> {
  return readFile(resolve(path), 'utf-8');
}

async function loadBuffer(path: string): Promise<Buffer> {
  return readFile(resolve(path));
}

async function run(): Promise<void> {
  const command = process.argv[2];
  if (!command) {
    console.error('Usage: cqc-ingest <facility|timeline|bundle|pdf|reconcile> [options]');
    process.exit(1);
  }

  if (command === 'facility') {
    const locationId = getArg('--location');
    const fixture = getArg('--fixture');
    if (fixture) {
      const raw = await loadJson(fixture);
      const { facility, quality } = ingestFacilityFromApi
        ? await ingestFacilityFromApi({
            locationId: raw.locationId || raw.location_id || 'unknown',
            fetch: async () => ({
              ok: true,
              status: 200,
              statusText: 'OK',
              json: async () => raw,
            }) as Response,
          })
        : ({ facility: raw, quality: { parse_confidence: 1, warnings: [] } });
      await outputResult({ facility, quality, raw });
      return;
    }
    if (!locationId) {
      throw new Error('--location is required');
    }
    const apiKey = getArg('--api-key');
    const baseUrl = getArg('--base-url');
    const result = await ingestFacilityFromApi({ locationId, apiKey, baseUrl });
    await outputResult(result);
    return;
  }

  if (command === 'timeline') {
    const file = getArg('--file');
    const url = getArg('--url');
    const locationId = getArg('--location');
    const baseUrl = getArg('--base-url');
    const html = file ? await loadText(file) : undefined;
    const result = await parseLocationTimeline({ html, sourceUrl: url, locationId, baseUrl });
    await outputResult(result);
    return;
  }

  if (command === 'bundle') {
    const file = getArg('--file');
    const url = getArg('--url');
    const baseUrl = getArg('--base-url');
    const html = file ? await loadText(file) : undefined;
    const result = await crawlHtmlAssessmentBundle({ html, url, baseUrl });
    await outputResult(result);
    return;
  }

  if (command === 'pdf') {
    const file = getArg('--file');
    const url = getArg('--url');
    const type = (getArg('--type') as PdfArtifact['type']) || undefined;
    const buffer = file ? await loadBuffer(file) : undefined;
    const result = await parsePdfArtifact({ buffer, url, type });
    await outputResult(result);
    return;
  }

  if (command === 'reconcile') {
    const facilityPath = getArg('--facility');
    const timelinePath = getArg('--timeline');
    const bundlePath = getArg('--bundle');
    const pdfPath = getArg('--pdf');

    if (!facilityPath || !timelinePath) {
      throw new Error('--facility and --timeline are required');
    }

    const facility = (await loadJson(facilityPath)) as FacilityRecord;
    const timeline = (await loadJson(timelinePath)) as LocationTimelineResult;
    const bundle = bundlePath ? ((await loadJson(bundlePath)) as HtmlBundleArtifact) : undefined;
    const pdfs = pdfPath ? ((await loadJson(pdfPath)) as PdfArtifact[]) : [];

    const event = reconcileAssessmentEvent(facility, timeline.entries[0], bundle, pdfs);
    await outputResult(event);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
