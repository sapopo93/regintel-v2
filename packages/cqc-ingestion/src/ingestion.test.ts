import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  ingestFacilityFromApi,
  parseLocationTimeline,
  crawlHtmlAssessmentBundle,
  parsePdfArtifact,
  reconcileAssessmentEvent,
  selectLatestByPublicationDate,
} from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = resolve(__dirname, '../fixtures');

async function readFixture(path: string): Promise<string> {
  return readFile(resolve(fixturesDir, path), 'utf-8');
}

async function readBuffer(path: string): Promise<Buffer> {
  return readFile(resolve(fixturesDir, path));
}

function createHtmlFetch(fixtures: Record<string, string>) {
  return async (input: string) => {
    const url = input.toString();
    const match = Object.entries(fixtures).find(([key]) => url.includes(key));
    if (!match) {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => '',
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => match[1],
    } as Response;
  };
}

describe('cqc ingestion pipeline', () => {
  it('Facility identity MUST match API even if HTML differs', async () => {
    const apiRaw = JSON.parse(await readFixture('json/api_location.json'));
    const result = await ingestFacilityFromApi({
      locationId: apiRaw.locationId,
      fetch: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => apiRaw,
      }) as Response,
    });

    expect(result.facility.service_name).toBe('Global Healthcare Solutions');
    expect(result.facility.address).toContain('Marks Tey');
  });

  it('HTML bundle must ingest all 6 domains', async () => {
    const overall = await readFixture('html/overall.html');
    const safe = await readFixture('html/safe.html');
    const effective = await readFixture('html/effective.html');
    const caring = await readFixture('html/caring.html');
    const responsive = await readFixture('html/responsive.html');
    const wellLed = await readFixture('html/well-led.html');

    const fetch = createHtmlFetch({
      '/overall': overall,
      '/safe': safe,
      '/effective': effective,
      '/caring': caring,
      '/responsive': responsive,
      '/well-led': wellLed,
    });

    const bundle = await crawlHtmlAssessmentBundle({
      url: 'https://www.cqc.org.uk/location/1-123456789/reports/assessment-2024-12/overall',
      fetch,
    });

    expect(bundle.sections.length).toBe(6);
    const domains = bundle.sections.map((section) => section.domain).sort();
    expect(domains).toEqual(['caring', 'effective', 'overall', 'responsive', 'safe', 'well-led']);
  });

  it('PDF-only reports still attach to facility', async () => {
    const timelineHtml = await readFixture('html/reports_index.html');
    const timeline = await parseLocationTimeline({
      html: timelineHtml,
      locationId: '1-123456789',
      sourceUrl: 'https://www.cqc.org.uk/location/1-123456789/reports',
    });

    const entry = timeline.entries.find((e) => e.assessment_id === 'assessment-2023-06');
    expect(entry).toBeTruthy();

    const pdfBuffer = await readBuffer('pdf/assessment-report.pdf');
    const pdf = await parsePdfArtifact({ buffer: pdfBuffer, type: 'full' });

    const facility = {
      location_id: '1-123456789',
      service_name: 'Global Healthcare Solutions',
      address: 'Laurels, Station Road, Marks Tey, Colchester, Essex, CO6 1EE',
      regulated_activities: [],
      population_groups: [],
      ratings: {},
    };

    const reconciled = reconcileAssessmentEvent(facility, entry!, undefined, [pdf]);
    expect(reconciled.artifacts.pdfs.length).toBe(1);
  });

  it('Latest report selection must be correct', async () => {
    const timelineHtml = await readFixture('html/reports_index.html');
    const timeline = await parseLocationTimeline({
      html: timelineHtml,
      locationId: '1-123456789',
      sourceUrl: 'https://www.cqc.org.uk/location/1-123456789/reports',
    });

    const latest = selectLatestByPublicationDate(timeline.entries);
    expect(latest?.assessment_id).toBe('assessment-2024-12');
  });

  it('Missing artifacts must not break ingestion', async () => {
    const timelineHtml = await readFixture('html/reports_index.html');
    const timeline = await parseLocationTimeline({
      html: timelineHtml,
      locationId: '1-123456789',
      sourceUrl: 'https://www.cqc.org.uk/location/1-123456789/reports',
    });

    const facility = {
      location_id: '1-123456789',
      service_name: 'Global Healthcare Solutions',
      address: 'Laurels, Station Road, Marks Tey, Colchester, Essex, CO6 1EE',
      regulated_activities: [],
      population_groups: [],
      ratings: {},
    };

    const reconciled = reconcileAssessmentEvent(facility, timeline.entries[0]);
    expect(reconciled.quality.warnings.length).toBeGreaterThan(0);
  });
});
