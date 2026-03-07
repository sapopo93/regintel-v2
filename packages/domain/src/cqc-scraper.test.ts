import { describe, expect, it } from 'vitest';
import { scrapeLatestReport } from './cqc-scraper';

const LONG_SENTENCE =
  'Residents told us staff treated them with dignity, respected personal preferences, and consistently involved families in care planning and daily routines.';

function htmlParagraph(text: string): string {
  return `<p>${text}</p>`;
}

describe('cqc-scraper', () => {
  it('extracts key question ratings and filters findings text from section pages', async () => {
    const baseUrl = 'https://example.test';
    const locationId = '1-123456789';
    const reportPlanId = 'plan-2026-01';

    const mainHtml = `
      <html>
        <body>
          <a href="/location/${locationId}/reports/${reportPlanId}/overall">Latest report</a>
          <div class="rating">Good</div>
          <time>1 January 2026</time>
          <div data-test="safe rating text: Good"></div>
        </body>
      </html>
    `;

    const overallHtml = `
      <html>
        <body>
          <table>
            <tr><th>Effective</th><td>Requires improvement</td></tr>
            <tr><th>Caring</th><td>Outstanding</td></tr>
          </table>
        </body>
      </html>
    `;

    const safeSectionHtml = `
      <html><body>
        ${htmlParagraph('Short paragraph')}
        ${htmlParagraph('In Accrington, BB5 5AA')}
        ${htmlParagraph('Your information helps us decide when, where and what to inspect.')}
        ${htmlParagraph(LONG_SENTENCE + ' Safe finding one.')}
        ${htmlParagraph(LONG_SENTENCE + ' Safe finding two.')}
        ${htmlParagraph(LONG_SENTENCE + ' Safe finding three.')}
        ${htmlParagraph(LONG_SENTENCE + ' Safe finding four.')}
        ${htmlParagraph(LONG_SENTENCE + ' Safe finding five.')}
        ${htmlParagraph(LONG_SENTENCE + ' Safe finding six.')}
      </body></html>
    `;

    const effectiveSectionHtml = `
      <html><body>
        ${htmlParagraph('tel: 01234 567 890')}
        ${htmlParagraph(LONG_SENTENCE + ' Effective finding one.')}
      </body></html>
    `;

    const caringSectionHtml = `
      <html><body>
        ${htmlParagraph("Let's make care better together.")}
        ${htmlParagraph(LONG_SENTENCE + ' Caring finding one.')}
      </body></html>
    `;

    const responsiveSectionHtml = `
      <html><body>
        ${htmlParagraph(LONG_SENTENCE + ' Responsive finding one.')}
      </body></html>
    `;

    const wellLedSectionHtml = `
      <html><body>
        ${htmlParagraph(LONG_SENTENCE + ' Well-led finding one.')}
      </body></html>
    `;

    const pages = new Map<string, string>([
      [`${baseUrl}/location/${locationId}`, mainHtml],
      [`${baseUrl}/location/${locationId}/reports/${reportPlanId}/overall`, overallHtml],
      [`${baseUrl}/location/${locationId}/reports/${reportPlanId}/overall/safe`, safeSectionHtml],
      [`${baseUrl}/location/${locationId}/reports/${reportPlanId}/overall/effective`, effectiveSectionHtml],
      [`${baseUrl}/location/${locationId}/reports/${reportPlanId}/overall/caring`, caringSectionHtml],
      [`${baseUrl}/location/${locationId}/reports/${reportPlanId}/overall/responsive`, responsiveSectionHtml],
      [`${baseUrl}/location/${locationId}/reports/${reportPlanId}/overall/well-led`, wellLedSectionHtml],
    ]);

    const fetchMock: typeof globalThis.fetch = async (input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const body = pages.get(url);
      return new Response(body ?? 'Not found', { status: body ? 200 : 404 });
    };

    const result = await scrapeLatestReport(locationId, {
      baseUrl,
      fetch: fetchMock,
      timeoutMs: 5000,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.report.keyQuestionRatings).toMatchObject({
      safe: 'Good',
      effective: 'Requires Improvement',
      caring: 'Outstanding',
    });

    const safeFindings = result.report.keyQuestionFindings?.safe ?? '';
    expect(safeFindings).toContain('Safe finding one.');
    expect(safeFindings).toContain('Safe finding six.');
    expect(safeFindings).not.toContain('In Accrington, BB5 5AA');
    expect(safeFindings).not.toContain('Your information helps us decide');
    expect(safeFindings.split('\n').length).toBeGreaterThanOrEqual(6);

    expect(result.report.keyQuestionFindings?.effective).toContain('Effective finding one.');
    expect(result.report.keyQuestionFindings?.effective).not.toContain('tel:');
    expect(result.report.keyQuestionFindings?.caring).toContain('Caring finding one.');
    expect(result.report.keyQuestionFindings?.caring).not.toContain("Let's make care better together");
  });
});
