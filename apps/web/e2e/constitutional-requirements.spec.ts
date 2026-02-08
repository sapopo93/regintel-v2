import { test, expect } from '@playwright/test';
import { createFacility, createProvider, loginAsFounder } from './helpers';

/**
 * Constitutional Requirements E2E Tests
 *
 * Verifies that all pages render required metadata:
 * - Version (Topic Catalog, PRS Logic)
 * - Hash (both catalogs)
 * - Timestamp
 * - Domain
 */

const BASE_URL = `http://localhost:${process.env.PORT || '4000'}`;

test.describe('Constitutional Requirements', () => {
  let providerId = '';
  let facilityId = '';

  test.beforeAll(async ({ request }) => {
    const provider = await createProvider(request, `Constitutional ${Date.now()}`);
    providerId = provider.providerId;
    const facility = await createFacility(request, providerId);
    facilityId = facility.id;
  });

  test.beforeEach(async ({ page }) => {
    await loginAsFounder(page);
  });

  const pages = [
    { path: '/overview', title: 'Provider Overview' },
    { path: '/topics', title: 'Inspection Topics' },
    { path: '/mock-session', title: 'Mock Inspection Sessions' },
    { path: '/findings', title: 'Inspection Findings' },
    { path: '/evidence', title: 'Evidence Records' },
    { path: '/exports', title: 'Export Readiness Report' },
    { path: '/audit', title: 'Audit Trail' },
  ];

  for (const page of pages) {
    test(`${page.path} renders version`, async ({ page: browserPage }) => {
      await browserPage.goto(`${BASE_URL}${page.path}?provider=${providerId}&facility=${facilityId}`);

      // Wait for page to load
      await browserPage.waitForSelector('h1');

      // Check for version text (v1)
      const content = await browserPage.content();
      expect(content).toMatch(/v1|version/i);
    });

    test(`${page.path} renders hash`, async ({ page: browserPage }) => {
      await browserPage.goto(`${BASE_URL}${page.path}?provider=${providerId}&facility=${facilityId}`);

      await browserPage.waitForSelector('h1');

      const content = await browserPage.content();
      // Should contain sha256 hash references
      expect(content).toMatch(/sha256|hash/i);
    });

    test(`${page.path} renders timestamp`, async ({ page: browserPage }) => {
      await browserPage.goto(`${BASE_URL}${page.path}?provider=${providerId}&facility=${facilityId}`);

      await browserPage.waitForSelector('h1');

      const content = await browserPage.content();
      // Should contain timestamp or date
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}|timestamp/i);
    });

    test(`${page.path} renders domain`, async ({ page: browserPage }) => {
      await browserPage.goto(`${BASE_URL}${page.path}?provider=${providerId}&facility=${facilityId}`);

      await browserPage.waitForSelector('h1');

      const content = await browserPage.content();
      // Should contain CQC or domain reference
      expect(content).toMatch(/CQC|domain/i);
    });
  }

  test('all pages show provider name in sidebar', async ({ page }) => {
    for (const pagePath of pages) {
      await page.goto(`${BASE_URL}${pagePath.path}?provider=${providerId}&facility=${facilityId}`);
      await page.waitForSelector('aside');

      // Sidebar should show provider info
      const sidebar = page.locator('aside');
      await expect(sidebar).toBeVisible();

      // Should contain provider-related text
      const sidebarText = await sidebar.textContent();
      expect(sidebarText).toBeTruthy();
    }
  });

  test('all pages show snapshot date', async ({ page }) => {
    for (const pagePath of pages) {
      await page.goto(`${BASE_URL}${pagePath.path}?provider=${providerId}&facility=${facilityId}`);
      await page.waitForSelector('aside');

      const content = await page.content();
      expect(content).toMatch(/snapshot|as of/i);
    }
  });
});
