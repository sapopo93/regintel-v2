import { test, expect } from '@playwright/test';
import { createFacility, createProvider, loginAsFounder } from './helpers';

/**
 * Menu Navigation E2E Tests
 *
 * Verifies that all sidebar menu items:
 * 1. Navigate to correct pages
 * 2. Call respective API endpoints
 * 3. Display constitutional metadata
 */

const BASE_URL = 'http://localhost:3000';
const API_BASE_URL = 'http://localhost:3001';

let providerId = '';
let facilityId = '';

test.beforeAll(async ({ request }) => {
  const provider = await createProvider(request, `Menu Nav ${Date.now()}`);
  providerId = provider.providerId;
  const facility = await createFacility(request, providerId);
  facilityId = facility.id;
});

test.beforeEach(async ({ page }) => {
  await loginAsFounder(page);
});

test.describe('Menu Navigation', () => {
  test('sidebar navigation triggers endpoint calls', async ({ page }) => {
    const facilityQuery = encodeURIComponent(facilityId);
    const endpoints = [
      { id: 'overview', endpoint: `/v1/providers/${providerId}/overview?facility=${facilityQuery}` },
      { id: 'topics', endpoint: `/v1/providers/${providerId}/topics?facility=${facilityQuery}` },
      { id: 'mock-session', endpoint: `/v1/providers/${providerId}/mock-sessions?facility=${facilityQuery}` },
      { id: 'findings', endpoint: `/v1/providers/${providerId}/findings?facility=${facilityQuery}` },
      { id: 'evidence', endpoint: `/v1/providers/${providerId}/evidence?facility=${facilityQuery}` },
      { id: 'exports', endpoint: `/v1/providers/${providerId}/exports?facility=${facilityQuery}` },
      { id: 'audit', endpoint: `/v1/providers/${providerId}/audit-trail` },
    ];

    await page.goto(`${BASE_URL}/overview?provider=${providerId}&facility=${facilityId}`);
    await page.waitForResponse((response) =>
      response.url().includes(endpoints[0].endpoint)
    );

    for (const item of endpoints.slice(1)) {
      const responsePromise = page.waitForResponse((response) =>
        response.url().includes(item.endpoint)
      );
      await page.click(`[data-testid="sidebar-link-${item.id}"]`);
      await responsePromise;
    }
  });

  test('Overview menu item calls /v1/providers/:id/overview', async ({ page }) => {
    // Setup API response spy
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/v1/providers')) {
        apiCalls.push(request.url());
      }
    });

    await page.goto(`${BASE_URL}/overview?provider=${providerId}&facility=${facilityId}`);

    // Wait for API call
    await page.waitForTimeout(1000);

    // Verify API endpoint was called
    const overviewCall = apiCalls.find(url => url.includes(`/v1/providers/${providerId}/overview`));
    expect(overviewCall).toBeTruthy();

    // Verify page content loaded
    await expect(page.locator('h1')).toContainText('Inspection Readiness Record');
  });

  test('Topics menu item calls /v1/providers/:id/topics', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/v1/providers')) {
        apiCalls.push(request.url());
      }
    });

    await page.goto(`${BASE_URL}/topics?provider=${providerId}&facility=${facilityId}`);
    await page.waitForTimeout(1000);

    const topicsCall = apiCalls.find(url => url.includes(`/v1/providers/${providerId}/topics`));
    expect(topicsCall).toBeTruthy();

    await expect(page.locator('h1')).toContainText('Inspection Topics');
  });

  test('Mock Inspection menu item calls /v1/providers/:id/mock-sessions', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/v1/providers')) {
        apiCalls.push(request.url());
      }
    });

    await page.goto(`${BASE_URL}/mock-session?provider=${providerId}&facility=${facilityId}`);
    await page.waitForTimeout(1000);

    const sessionsCall = apiCalls.find(url => url.includes(`/v1/providers/${providerId}/mock-sessions`));
    expect(sessionsCall).toBeTruthy();

    await expect(page.locator('h1')).toContainText('Practice Inspections');
  });

  test('Findings menu item calls /v1/providers/:id/findings', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/v1/providers')) {
        apiCalls.push(request.url());
      }
    });

    await page.goto(`${BASE_URL}/findings?provider=${providerId}&facility=${facilityId}`);
    await page.waitForTimeout(1000);

    const findingsCall = apiCalls.find(url => url.includes(`/v1/providers/${providerId}/findings`));
    expect(findingsCall).toBeTruthy();

    await expect(page.locator('h1')).toContainText('Inspection Findings');
  });

  test('Evidence menu item calls /v1/providers/:id/evidence', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/v1/providers')) {
        apiCalls.push(request.url());
      }
    });

    await page.goto(`${BASE_URL}/evidence?provider=${providerId}&facility=${facilityId}`);
    await page.waitForTimeout(1000);

    const evidenceCall = apiCalls.find(url => url.includes(`/v1/providers/${providerId}/evidence`));
    expect(evidenceCall).toBeTruthy();

    await expect(page.locator('h1')).toContainText('Evidence Records');
  });

  test('Exports page loads correctly', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/v1/providers')) {
        apiCalls.push(request.url());
      }
    });

    await page.goto(`${BASE_URL}/exports?provider=${providerId}&facility=${facilityId}`);

    // Verify page content
    await expect(page.locator('h1')).toContainText('Export Readiness Report');
    const exportsCall = apiCalls.find(url => url.includes(`/v1/providers/${providerId}/exports`));
    expect(exportsCall).toBeTruthy();
  });

  test('Audit Trail menu item calls /v1/providers/:id/audit-trail', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/v1/providers')) {
        apiCalls.push(request.url());
      }
    });

    await page.goto(`${BASE_URL}/audit?provider=${providerId}&facility=${facilityId}`);
    await page.waitForTimeout(1000);

    const auditCall = apiCalls.find(url => url.includes(`/v1/providers/${providerId}/audit-trail`));
    expect(auditCall).toBeTruthy();

    await expect(page.locator('h1')).toContainText('Audit Trail');
  });

  test('All pages display constitutional metadata', async ({ page }) => {
    const pages = [
      '/overview',
      '/topics',
      '/mock-session',
      '/findings',
      '/evidence',
      '/audit',
    ];

    for (const pagePath of pages) {
      await page.goto(`${BASE_URL}${pagePath}?provider=${providerId}&facility=${facilityId}`);
      await page.waitForTimeout(500);

      // Check for version badges or metadata
      const content = await page.content();

      // Should contain version information
      expect(content).toMatch(/v1|version/i);

      // Should contain hash or timestamp
      expect(content).toMatch(/hash|sha256|timestamp/i);
    }
  });
});
